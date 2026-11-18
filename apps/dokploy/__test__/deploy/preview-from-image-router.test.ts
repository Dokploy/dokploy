import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	upsertPreviewDeploymentFromImage: vi.fn(),
	findPreviewDeploymentByPullRequestNumber: vi.fn(),
	removePreviewDeployment: vi.fn(),
	deploy: vi.fn(),
	running: [] as Array<() => void>,
}));

// Deploys stay active until the test finishes them, like a long image pull.
vi.mock("@/server/queues/deployments-queue", () => ({
	processDeploymentJob: vi.fn(
		() =>
			new Promise<void>((resolve) => {
				mocks.running.push(resolve);
			}),
	),
}));

vi.mock("@/server/queues/concurrency", () => ({
	resolveBuildsConcurrency: async () => 1,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	hasValidLicense: vi.fn(async () => false),
	findApplicationById: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	findPreviewDeploymentsByApplicationId: vi.fn(),
	findPreviewDeploymentByPullRequestNumber:
		mocks.findPreviewDeploymentByPullRequestNumber,
	getDomainHost: (domain: { https: boolean; host: string }) =>
		`${domain.https ? "https" : "http"}://${domain.host}`,
	removePreviewDeployment: mocks.removePreviewDeployment,
	upsertPreviewDeploymentFromImage: mocks.upsertPreviewDeploymentFromImage,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: mocks.deploy,
}));

delete (globalThis as { __dokployDeploymentQueue?: unknown })
	.__dokployDeploymentQueue;
const { previewDeploymentRouter } = await import(
	"@/server/api/routers/preview-deployment"
);
const { myQueue } = await import("@/server/queues/queueSetup");
const { processDeploymentJob } = await import(
	"@/server/queues/deployments-queue"
);

const caller = previewDeploymentRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof previewDeploymentRouter.createCaller>[0]);

const preview = {
	previewDeploymentId: "preview-1",
	domain: { host: "preview-web-abc.example.com", https: true, path: "/" },
	application: { applicationId: "app-1", serverId: "server-1" },
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const queuedPreviews = async (state: "waiting" | "active") =>
	(await myQueue.getJobs([state])).map(
		(job) => (job.data as { previewDeploymentId?: string }).previewDeploymentId,
	);

beforeEach(async () => {
	myQueue.clearWaiting();
	for (const finish of mocks.running.splice(0)) finish();
	await flush();
	vi.clearAllMocks();
	mocks.upsertPreviewDeploymentFromImage.mockResolvedValue(preview);
});

describe("previewDeployment.deployFromImage", () => {
	const request = {
		applicationId: "app-1",
		dockerImage: "ghcr.io/acme/web:pr-7",
		pullRequestNumber: "7",
	};

	it("queues a preview deployment of the image and returns its URL", async () => {
		const result = await caller.deployFromImage(request);

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ deployment: ["create"] },
		);
		expect(mocks.upsertPreviewDeploymentFromImage).toHaveBeenCalledWith(
			request,
		);
		await flush();
		const [job] = await myQueue.getJobs();
		expect(job?.data).toMatchObject({
			applicationId: "app-1",
			applicationType: "application-preview",
			previewDeploymentId: "preview-1",
			type: "deploy",
			serverId: "server-1",
		});
		expect(result).toEqual({
			previewDeploymentId: "preview-1",
			url: "https://preview-web-abc.example.com/",
		});
	});

	it("does not touch previews when the caller lacks access", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValueOnce(
			new Error("UNAUTHORIZED"),
		);

		await expect(caller.deployFromImage(request)).rejects.toThrow();
		expect(mocks.upsertPreviewDeploymentFromImage).not.toHaveBeenCalled();
		expect(await myQueue.getJobs()).toHaveLength(0);
	});

	it("keeps only the latest waiting deploy of a pull request", async () => {
		mocks.upsertPreviewDeploymentFromImage.mockImplementation(
			async ({ pullRequestNumber }: { pullRequestNumber: string }) =>
				pullRequestNumber === "8"
					? { ...preview, previewDeploymentId: "preview-2" }
					: preview,
		);

		await caller.deployFromImage(request);
		await flush();
		await caller.deployFromImage({ ...request, pullRequestNumber: "8" });
		await caller.deployFromImage({
			...request,
			dockerImage: "ghcr.io/acme/web:pr-7-b",
		});
		await caller.deployFromImage({
			...request,
			dockerImage: "ghcr.io/acme/web:pr-7-c",
		});
		await flush();

		expect(await queuedPreviews("active")).toEqual(["preview-1"]);
		expect((await queuedPreviews("waiting")).sort()).toEqual([
			"preview-1",
			"preview-2",
		]);
		expect(processDeploymentJob).toHaveBeenCalledTimes(1);
	});

	it("rejects a pull request URL that is not http(s)", async () => {
		await expect(
			caller.deployFromImage({
				...request,
				pullRequestURL: "javascript:alert(1)",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.upsertPreviewDeploymentFromImage).not.toHaveBeenCalled();
	});
});

describe("previewDeployment.deleteByPullRequest", () => {
	it("removes the preview of the pull request", async () => {
		mocks.findPreviewDeploymentByPullRequestNumber.mockResolvedValue(preview);

		await caller.deleteByPullRequest({
			applicationId: "app-1",
			pullRequestNumber: "7",
		});

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ deployment: ["cancel"] },
		);
		expect(mocks.findPreviewDeploymentByPullRequestNumber).toHaveBeenCalledWith(
			"app-1",
			"7",
		);
		expect(mocks.removePreviewDeployment).toHaveBeenCalledWith("preview-1");
	});

	it("returns NOT_FOUND when the pull request has no preview", async () => {
		mocks.findPreviewDeploymentByPullRequestNumber.mockResolvedValue(undefined);

		await expect(
			caller.deleteByPullRequest({
				applicationId: "app-1",
				pullRequestNumber: "8",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.removePreviewDeployment).not.toHaveBeenCalled();
	});
});
