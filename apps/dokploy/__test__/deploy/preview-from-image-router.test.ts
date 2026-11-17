import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	upsertPreviewDeploymentFromImage: vi.fn(),
	findPreviewDeploymentByPullRequestNumber: vi.fn(),
	removePreviewDeployment: vi.fn(),
	queueAdd: vi.fn(),
	deploy: vi.fn(),
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

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: mocks.queueAdd },
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: mocks.deploy,
}));

const { previewDeploymentRouter } = await import(
	"@/server/api/routers/preview-deployment"
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

beforeEach(() => {
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
		expect(mocks.queueAdd.mock.calls[0]?.[1]).toMatchObject({
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
		expect(mocks.queueAdd).not.toHaveBeenCalled();
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
