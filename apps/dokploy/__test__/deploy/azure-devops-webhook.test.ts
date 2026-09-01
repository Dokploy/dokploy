import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	shouldDeploy: vi.fn(() => true),
	getBitbucketHeaders: vi.fn(() => ({})),
	getAzureDevopsHeaders: vi.fn(() => ({ Authorization: "Basic token" })),
}));
vi.mock("@dokploy/server/db", () => ({ db: { query: { applications: {} } } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/server/db/schema", () => ({
	applications: { refreshToken: "refreshToken" },
}));
vi.mock("@/server/queues/queueSetup", () => ({ myQueue: { add: vi.fn() } }));
vi.mock("@/server/utils/deploy", () => ({ deploy: vi.fn() }));

const {
	extractAzureDevopsCommittedPaths,
	extractBranchName,
	extractCommitMessage,
	extractHash,
} = await import("@/pages/api/deploy/[refreshToken]");

const payload = {
	eventType: "git.push",
	resource: {
		refUpdates: [
			{
				name: "refs/heads/main",
				newObjectId: "abc123",
			},
		],
		commits: [{ commitId: "abc123", comment: "Ship Azure support" }],
	},
};

describe("Azure DevOps push webhook", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("extracts branch, hash, and commit title", () => {
		expect(extractBranchName({}, payload)).toBe("main");
		expect(extractHash({}, payload)).toBe("abc123");
		expect(extractCommitMessage({}, payload)).toBe("Ship Azure support");
	});

	it("loads changed paths for watch-path filtering", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					changes: [{ item: { path: "/apps/web/index.ts" } }],
				}),
				{ status: 200 },
			),
		);
		const paths = await extractAzureDevopsCommittedPaths(
			payload,
			{
				azureDevopsId: "azure-1",
				organizationName: "contoso",
				personalAccessToken: "secret",
				gitProviderId: "provider-1",
			},
			"project-1",
			"repo-1",
		);

		expect(paths).toEqual(["apps/web/index.ts"]);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://dev.azure.com/contoso/project-1/_apis/git/repositories/repo-1/commits/abc123/changes?api-version=7.1",
			{ headers: { Authorization: "Basic token" } },
		);
	});
});
