import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldDeploy } from "../../../../packages/server/src/utils/watch-paths/should-deploy";

const mocks = vi.hoisted(() => ({
	applicationsFindFirst: vi.fn(),
	queueAdd: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
}));

vi.mock("@/server/db/schema", () => ({
	applications: {
		refreshToken: "application.refreshToken",
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: mocks.applicationsFindFirst,
			},
		},
	},
}));

vi.mock("@dokploy/server", async () => {
	const { shouldDeploy } = await import(
		"../../../../packages/server/src/utils/watch-paths/should-deploy"
	);
	return {
		IS_CLOUD: false,
		shouldDeploy,
		getBitbucketHeaders: vi.fn(() => ({})),
	};
});

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: {
		add: mocks.queueAdd,
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
}));

import handler, {
	extractCommittedPaths,
} from "@/pages/api/deploy/[refreshToken]";

const API = "https://api.bitbucket.org/2.0/repositories/workspace/repo";
const WATCH_PATHS = ["src/**"];

const bitbucket = {
	bitbucketWorkspaceName: "workspace",
	bitbucketUsername: "user",
} as any;

const pushBody = (newHash: string, oldHash?: string) => ({
	push: {
		changes: [
			{
				new: {
					name: "main",
					target: { hash: newHash, message: "commit" },
				},
				old: oldHash ? { name: "main", target: { hash: oldHash } } : null,
			},
		],
	},
});

const jsonResponse = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	mocks.queueAdd.mockReset();
	mocks.applicationsFindFirst.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("extractCommittedPaths (Bitbucket)", () => {
	it("includes files deleted by the push", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				values: [{ status: "removed", new: null, old: { path: "src/old.ts" } }],
			}),
		);

		const paths = await extractCommittedPaths(
			pushBody("bbb", "aaa"),
			bitbucket,
			"repo",
		);

		expect(paths).toEqual(["src/old.ts"]);
		expect(shouldDeploy(WATCH_PATHS, paths)).toBe(true);
	});

	it("includes the old path of a file renamed out of a watched folder", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				values: [
					{
						status: "renamed",
						new: { path: "lib/app.ts" },
						old: { path: "src/app.ts" },
					},
				],
			}),
		);

		const paths = await extractCommittedPaths(
			pushBody("bbb", "aaa"),
			bitbucket,
			"repo",
		);

		expect(shouldDeploy(WATCH_PATHS, paths)).toBe(true);
	});

	it("diffs the whole push range, not only the tip commit", async () => {
		// Push of two commits: c1 touches src/app.ts, c2 (the tip) only README.md.
		fetchMock.mockImplementation(async (url: string) => {
			if (url === `${API}/diffstat/c2..c0`) {
				return jsonResponse({
					values: [
						{
							status: "modified",
							new: { path: "src/app.ts" },
							old: { path: "src/app.ts" },
						},
						{
							status: "modified",
							new: { path: "README.md" },
							old: { path: "README.md" },
						},
					],
				});
			}
			if (url === `${API}/diffstat/c2`) {
				return jsonResponse({
					values: [
						{
							status: "modified",
							new: { path: "README.md" },
							old: { path: "README.md" },
						},
					],
				});
			}
			return jsonResponse({ error: "not found" }, 404);
		});

		const paths = await extractCommittedPaths(
			pushBody("c2", "c0"),
			bitbucket,
			"repo",
		);

		expect(fetchMock).toHaveBeenCalledWith(
			`${API}/diffstat/c2..c0`,
			expect.anything(),
		);
		expect(shouldDeploy(WATCH_PATHS, paths)).toBe(true);
	});

	it("diffs only the tip commit when the branch is new", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ values: [{ new: { path: "src/app.ts" }, old: null }] }),
		);

		const paths = await extractCommittedPaths(
			pushBody("c1"),
			bitbucket,
			"repo",
		);

		expect(fetchMock).toHaveBeenCalledWith(
			`${API}/diffstat/c1`,
			expect.anything(),
		);
		expect(paths).toEqual(["src/app.ts"]);
	});

	it("follows pagination", async () => {
		const page2 = `${API}/diffstat/bbb..aaa?page=2`;
		fetchMock.mockImplementation(async (url: string) => {
			if (url === `${API}/diffstat/bbb..aaa`) {
				return jsonResponse({
					values: [{ new: { path: "README.md" }, old: { path: "README.md" } }],
					next: page2,
				});
			}
			if (url === page2) {
				return jsonResponse({
					values: [
						{ new: { path: "src/app.ts" }, old: { path: "src/app.ts" } },
					],
				});
			}
			return jsonResponse({ error: "not found" }, 404);
		});

		const paths = await extractCommittedPaths(
			pushBody("bbb", "aaa"),
			bitbucket,
			"repo",
		);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(paths).toContain("src/app.ts");
		expect(shouldDeploy(WATCH_PATHS, paths)).toBe(true);
	});

	it("returns null when the diffstat request fails", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));

		const paths = await extractCommittedPaths(
			pushBody("bbb", "aaa"),
			bitbucket,
			"repo",
		);

		expect(paths).toBeNull();
	});
});

describe("refresh-token webhook with Bitbucket watch paths", () => {
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

	const request = {
		query: { refreshToken: "refresh-token" },
		headers: { "x-event-key": "repo:push" },
		body: pushBody("bbb", "aaa"),
	} as unknown as NextApiRequest;

	beforeEach(() => {
		mocks.applicationsFindFirst.mockResolvedValue({
			applicationId: "application-id",
			sourceType: "bitbucket",
			autoDeploy: true,
			bitbucketBranch: "main",
			bitbucketRepositorySlug: "repo",
			bitbucket,
			watchPaths: WATCH_PATHS,
			serverId: null,
		});
	});

	it("deploys instead of silently skipping when the diffstat API fails", async () => {
		fetchMock.mockRejectedValueOnce(new Error("network down"));
		const res = createResponse();

		await handler(request, res);

		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("still skips the deploy when no watched path changed", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				values: [{ new: { path: "README.md" }, old: { path: "README.md" } }],
			}),
		);
		const res = createResponse();

		await handler(request, res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({ message: "Watch Paths Not Match" });
	});
});
