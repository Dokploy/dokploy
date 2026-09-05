import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
	composeFindFirst: vi.fn(),
	applicationsFindFirst: vi.fn(),
	queueAdd: vi.fn(),
	deploy: vi.fn(),
	// Wraps the real shouldDeploy so tests assert call counts while exercising
	// the real micromatch-based watch-paths logic (rebound in beforeEach).
	shouldDeploy: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
}));

vi.mock("@/server/db/schema", () => ({
	compose: { refreshToken: "compose.refreshToken" },
	applications: { refreshToken: "applications.refreshToken" },
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			compose: { findFirst: mocks.composeFindFirst },
			applications: { findFirst: mocks.applicationsFindFirst },
		},
	},
}));

vi.mock("@dokploy/server", async () => {
	const { shouldDeploy: realShouldDeploy } = await vi.importActual<
		typeof import("@dokploy/server/utils/watch-paths/should-deploy")
	>("@dokploy/server/utils/watch-paths/should-deploy");
	mocks.shouldDeploy.mockImplementation(realShouldDeploy);
	return {
		IS_CLOUD: false,
		shouldDeploy: mocks.shouldDeploy,
		getBitbucketHeaders: vi.fn(() => ({})),
	};
});

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: mocks.queueAdd },
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: mocks.deploy,
}));

import applicationHandler from "@/pages/api/deploy/[refreshToken]";
import composeHandler from "@/pages/api/deploy/compose/[refreshToken]";

const REFRESH_TOKEN = "test-refresh-token";

// Rebind the shouldDeploy spy to the real implementation. vi.clearAllMocks()
// wipes the implementation installed in the mock factory above, so each test
// must restore it to keep exercising the real watch-paths logic.
const rebindRealShouldDeploy = async () => {
	const { shouldDeploy: realShouldDeploy } = await vi.importActual<
		typeof import("@dokploy/server/utils/watch-paths/should-deploy")
	>("@dokploy/server/utils/watch-paths/should-deploy");
	mocks.shouldDeploy.mockImplementation(realShouldDeploy);
};

const createResponse = () => {
	const res = {
		status: vi.fn(),
		json: vi.fn(),
	} as unknown as NextApiResponse & {
		status: ReturnType<typeof vi.fn>;
		json: ReturnType<typeof vi.fn>;
	};
	res.status.mockImplementation(() => res);
	res.json.mockImplementation(() => res);
	return res;
};

// Mirrors the real Soft Serve push payload shape (charmbracelet/soft-serve
// pkg/webhook): commits carry id/message/title/author/committer/timestamp but
// NO per-commit file lists (added/modified/removed).
const createSoftServePushRequest = (branch: string, hash = "abc123def456") =>
	({
		query: { refreshToken: REFRESH_TOKEN },
		headers: {
			"x-softserve-event": "push",
			"content-type": "application/json",
		},
		body: {
			event: "push",
			ref: `refs/heads/${branch}`,
			before: "0000000000000000000000000000000000000000",
			after: hash,
			commits: [
				{
					id: hash,
					message: "update api server",
					title: "update api server",
					author: {
						name: "dev",
						email: "dev@x",
						date: "2026-01-01T00:00:00Z",
					},
					committer: {
						name: "dev",
						email: "dev@x",
						date: "2026-01-01T00:00:00Z",
					},
					timestamp: "2026-01-01T00:00:00Z",
				},
			],
		},
	}) as unknown as NextApiRequest;

// A github-shaped payload routed through the `sourceType === "git"` branch
// (provider ladder). Used to assert the watch-paths filter still applies to
// providers that DO report file lists.
const createGithubPushRequest = (branch: string, modified: string[] = []) =>
	({
		query: { refreshToken: REFRESH_TOKEN },
		headers: { "x-github-event": "push" },
		body: {
			ref: `refs/heads/${branch}`,
			after: "abc123def456",
			head_commit: { message: "update", id: "abc123def456" },
			commits: [{ added: [], modified, removed: [] }],
		},
	}) as unknown as NextApiRequest;

const createMockCompose = (overrides: Record<string, unknown> = {}) => ({
	composeId: "compose-id",
	sourceType: "git",
	customGitBranch: "main",
	customGitUrl: "ssh://git@softserve.local:23231/myrepo.git",
	autoDeploy: true,
	watchPaths: ["services/api/**"],
	serverId: null,
	environment: { project: {} },
	bitbucket: null,
	...overrides,
});

const createMockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "application-id",
	sourceType: "git",
	customGitBranch: "main",
	customGitUrl: "ssh://git@softserve.local:23231/myrepo.git",
	autoDeploy: true,
	watchPaths: ["services/api/**"],
	serverId: null,
	environment: { project: {} },
	bitbucket: null,
	...overrides,
});

describe("Soft Serve webhook — Compose handler", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await rebindRealShouldDeploy();
		mocks.composeFindFirst.mockResolvedValue(createMockCompose());
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
	});

	it("deploys a matching-branch Soft Serve push with non-empty watchPaths", async () => {
		const res = createResponse();

		await composeHandler(createSoftServePushRequest("main"), res);

		// Soft Serve exposes no file lists, so the watch-paths filter is bypassed.
		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				composeId: "compose-id",
				applicationType: "compose",
				type: "deploy",
			}),
			expect.objectContaining({ removeOnComplete: true, removeOnFail: true }),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Compose deployed successfully",
		});
	});

	it("rejects a Soft Serve push on a non-matching branch before watch-paths", async () => {
		const res = createResponse();

		await composeHandler(createSoftServePushRequest("feature"), res);

		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
		expect(res.json).toHaveBeenCalledWith({ message: "Branch Not Match" });
	});

	it("still applies the watchPaths filter for github-shaped payloads", async () => {
		const res = createResponse();

		await composeHandler(
			createGithubPushRequest("main", ["docs/readme.md"]),
			res,
		);

		expect(mocks.shouldDeploy).toHaveBeenCalledWith(
			["services/api/**"],
			["docs/readme.md"],
		);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
		expect(res.json).toHaveBeenCalledWith({ message: "Watch Paths Not Match" });
	});

	it("deploys for github-shaped payloads when watchPaths match", async () => {
		const res = createResponse();

		await composeHandler(
			createGithubPushRequest("main", ["services/api/server.ts"]),
			res,
		);

		expect(mocks.shouldDeploy).toHaveBeenCalledTimes(1);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

describe("Soft Serve webhook — Application handler", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await rebindRealShouldDeploy();
		mocks.applicationsFindFirst.mockResolvedValue(createMockApplication());
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
	});

	it("deploys a matching-branch Soft Serve push with non-empty watchPaths", async () => {
		const res = createResponse();

		await applicationHandler(createSoftServePushRequest("main"), res);

		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				applicationType: "application",
				type: "deploy",
			}),
			expect.objectContaining({ removeOnComplete: true, removeOnFail: true }),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Application deployed successfully",
		});
	});

	it("rejects a Soft Serve push on a non-matching branch before watch-paths", async () => {
		const res = createResponse();

		await applicationHandler(createSoftServePushRequest("feature"), res);

		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
		expect(res.json).toHaveBeenCalledWith({ message: "Branch Not Match" });
	});

	it("still applies the watchPaths filter for github-shaped payloads", async () => {
		const res = createResponse();

		await applicationHandler(
			createGithubPushRequest("main", ["docs/readme.md"]),
			res,
		);

		expect(mocks.shouldDeploy).toHaveBeenCalledWith(
			["services/api/**"],
			["docs/readme.md"],
		);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
		expect(res.json).toHaveBeenCalledWith({ message: "Watch Paths Not Match" });
	});

	it("deploys for github-shaped payloads when watchPaths match", async () => {
		const res = createResponse();

		await applicationHandler(
			createGithubPushRequest("main", ["services/api/server.ts"]),
			res,
		);

		expect(mocks.shouldDeploy).toHaveBeenCalledTimes(1);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});
