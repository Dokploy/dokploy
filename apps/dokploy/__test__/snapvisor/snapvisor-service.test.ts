import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Service-level behaviour of the Snapvisor integration: looking up (never
 * creating — see the docstring on `registerPreviewDeployment`) the Snapvisor
 * build for a preview deployment's latest commit, and storing the result.
 * Snapvisor itself is faked at the `fetch` boundary so the real REST client
 * runs.
 */

const mocks = vi.hoisted(() => ({
	deploymentFindFirst: vi.fn(),
	integrationFindFirst: vi.fn(async () => undefined as unknown),
	findApplicationById: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	updatePreviewDeployment: vi.fn(async () => [{}]),
}));

vi.mock("@dokploy/server/db", () => {
	const tableMock = () => ({
		findFirst: vi.fn(async () => undefined),
		findMany: vi.fn(async () => []),
	});
	return {
		db: {
			query: new Proxy({} as Record<string, unknown>, {
				get: (_target, table) => {
					if (table === "deployments") {
						return { findFirst: mocks.deploymentFindFirst, findMany: vi.fn() };
					}
					if (table === "snapvisorIntegration") {
						return {
							findFirst: mocks.integrationFindFirst,
							findMany: vi.fn(),
						};
					}
					return tableMock();
				},
			}),
			execute: vi.fn(async () => []),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@dokploy/server/services/application", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/application")
	>()),
	findApplicationById: mocks.findApplicationById,
}));

vi.mock(
	"@dokploy/server/services/preview-deployment",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/services/preview-deployment")
		>()),
		findPreviewDeploymentById: mocks.findPreviewDeploymentById,
		updatePreviewDeployment: mocks.updatePreviewDeployment,
	}),
);

const {
	registerPreviewDeployment,
	findLatestPreviewCommitSha,
	snapvisorBuildReviewUrl,
} = await import("@dokploy/server/services/snapvisor");

const ORG = "org-1";
const PREVIEW_ID = "preview-1";
// Snapvisor's `headSha` filter matches on the full SHA1: 40 hex characters.
const FULL_SHA = "abc1234defabc1234defabc1234defabc1234def";

const application = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	snapvisorProjectName: "web",
	environment: { project: { organizationId: ORG } },
	...overrides,
});

let toolCalls: { url: string }[] = [];
let responder: (url: string) => unknown = () => ({
	results: [],
	pageInfo: { total: 0, page: 1, perPage: 10 },
});

const installFetch = () => {
	toolCalls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			toolCalls.push({ url });
			return Response.json(responder(url));
		}),
	);
};

const integrationRow = {
	snapvisorId: "sv-1",
	organizationId: ORG,
	name: "Snapvisor",
	accessToken: "token-abc",
	accountSlug: "my-team",
	baseUrl: "https://api.snapvisor.io",
	createdAt: new Date(),
};

beforeEach(() => {
	vi.clearAllMocks();
	installFetch();
	mocks.findPreviewDeploymentById.mockResolvedValue({
		previewDeploymentId: PREVIEW_ID,
		applicationId: "app-1",
	});
	mocks.findApplicationById.mockResolvedValue(application());
	mocks.deploymentFindFirst.mockResolvedValue({
		description: `Commit: ${FULL_SHA}`,
		createdAt: new Date().toISOString(),
	});
	mocks.integrationFindFirst.mockResolvedValue(integrationRow);
});

describe("registerPreviewDeployment", () => {
	it("looks up the Snapvisor build for the deployed commit and stores it", async () => {
		responder = (url) => {
			expect(url).toContain("/v2/projects/my-team/web/builds");
			expect(url).toContain(`headSha=${FULL_SHA}`);
			return {
				results: [
					{
						id: "build-1",
						number: 42,
						head: { sha: FULL_SHA, branch: "feature" },
						base: null,
						status: "changes-detected",
						stats: null,
						url: "https://app.snapvisor.io/my-team/web/builds/42",
					},
				],
				pageInfo: { total: 1, page: 1, perPage: 1 },
			};
		};

		const result = await registerPreviewDeployment({
			previewDeploymentId: PREVIEW_ID,
		});

		expect(toolCalls[0]?.url.startsWith("https://api.snapvisor.io/v2/")).toBe(
			true,
		);
		expect(result.registered).toBe(true);
		expect(result.build?.id).toBe("build-1");
		expect(mocks.updatePreviewDeployment).toHaveBeenCalledWith(PREVIEW_ID, {
			snapvisorDeploymentId: "build-1",
			snapvisorBuildId: "42",
			snapvisorBuildStatus: "changes-detected",
		});
	});

	it("is skipped when the application has no Snapvisor project configured", async () => {
		mocks.findApplicationById.mockResolvedValue(
			application({ snapvisorProjectName: null }),
		);
		const result = await registerPreviewDeployment({
			previewDeploymentId: PREVIEW_ID,
		});
		expect(result).toEqual({
			registered: false,
			reason: "Visual testing is off",
		});
		expect(toolCalls).toHaveLength(0);
		expect(mocks.updatePreviewDeployment).not.toHaveBeenCalled();
	});

	it("is skipped for a compose preview (no applicationId)", async () => {
		mocks.findPreviewDeploymentById.mockResolvedValue({
			previewDeploymentId: PREVIEW_ID,
			applicationId: null,
		});
		const result = await registerPreviewDeployment({
			previewDeploymentId: PREVIEW_ID,
		});
		expect(result).toEqual({
			registered: false,
			reason: "Not an application preview",
		});
		expect(mocks.findApplicationById).not.toHaveBeenCalled();
	});

	it("is skipped when no commit sha has been recorded yet", async () => {
		mocks.deploymentFindFirst.mockResolvedValue(undefined);

		const result = await registerPreviewDeployment({
			previewDeploymentId: PREVIEW_ID,
		});
		expect(result).toEqual({
			registered: false,
			reason: "No commit sha recorded yet",
		});
		expect(toolCalls).toHaveLength(0);
	});
});

describe("findLatestPreviewCommitSha", () => {
	const FULL_SHA_2 = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

	it("extracts the sha from the `Commit: <sha>` marker", async () => {
		mocks.deploymentFindFirst.mockResolvedValue({
			description: `Commit: ${FULL_SHA_2}`,
			createdAt: new Date().toISOString(),
		});
		await expect(findLatestPreviewCommitSha(PREVIEW_ID)).resolves.toBe(
			FULL_SHA_2,
		);
	});

	it("returns null when there is no deployment or no marker", async () => {
		mocks.deploymentFindFirst.mockResolvedValue(undefined);
		await expect(findLatestPreviewCommitSha(PREVIEW_ID)).resolves.toBeNull();

		mocks.deploymentFindFirst.mockResolvedValue({
			description: "Manual redeploy",
			createdAt: new Date().toISOString(),
		});
		await expect(findLatestPreviewCommitSha(PREVIEW_ID)).resolves.toBeNull();
	});

	it("rejects an abbreviated sha (Snapvisor's headSha filter needs the full 40 characters)", async () => {
		mocks.deploymentFindFirst.mockResolvedValue({
			description: "Commit: abc1234",
			createdAt: new Date().toISOString(),
		});
		await expect(findLatestPreviewCommitSha(PREVIEW_ID)).resolves.toBeNull();
	});
});

describe("legacy app.snapvisor.io base URL", () => {
	it("still calls the API host for an integration saved with the old default", async () => {
		mocks.integrationFindFirst.mockResolvedValue({
			...integrationRow,
			baseUrl: "https://app.snapvisor.io/",
		});
		await registerPreviewDeployment({ previewDeploymentId: PREVIEW_ID });
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.url.startsWith("https://api.snapvisor.io/v2/")).toBe(
			true,
		);
	});
});

describe("snapvisorBuildReviewUrl", () => {
	it("builds web links on the web host for the API default and the legacy value", () => {
		for (const baseUrl of [
			"https://api.snapvisor.io",
			"https://app.snapvisor.io/",
		]) {
			expect(
				snapvisorBuildReviewUrl({ baseUrl, accountSlug: "my-team" }, "web", 42),
			).toBe("https://app.snapvisor.io/my-team/web/builds/42");
		}
	});

	it("uses a custom host as-is", () => {
		expect(
			snapvisorBuildReviewUrl(
				{ baseUrl: "https://sv.example/", accountSlug: "t" },
				"p",
				"7",
			),
		).toBe("https://sv.example/t/p/builds/7");
	});
});
