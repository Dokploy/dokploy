import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applicationsFindFirst: vi.fn(),
	queueAdd: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
}));

vi.mock("@/server/db/schema", () => ({
	applications: { refreshToken: "application.refreshToken" },
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { applications: { findFirst: mocks.applicationsFindFirst } },
	},
}));

vi.mock("@dokploy/server", async () => ({
	IS_CLOUD: false,
	shouldDeploy: (
		await import("@dokploy/server/utils/watch-paths/should-deploy")
	).shouldDeploy,
	getBitbucketHeaders: vi.fn(() => ({ Authorization: "Basic test" })),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: mocks.queueAdd },
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
}));

import handler from "@/pages/api/deploy/[refreshToken]";

const API = "https://api.bitbucket.org/2.0/repositories/acme/web";

const diffstat = (
	status: string,
	oldPath: string | null,
	newPath: string | null,
) => ({
	type: "diffstat",
	status,
	old: oldPath ? { path: oldPath, type: "commit_file" } : null,
	new: newPath ? { path: newPath, type: "commit_file" } : null,
});

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const pushRequest = (newHash: string, oldHash: string | null = "base0") =>
	({
		query: { refreshToken: "refresh-token" },
		headers: { "x-event-key": "repo:push" },
		body: {
			push: {
				changes: [
					{
						new: {
							type: "branch",
							name: "main",
							target: { type: "commit", hash: newHash, message: "msg\n" },
						},
						old: oldHash
							? {
									type: "branch",
									name: "main",
									target: { type: "commit", hash: oldHash },
								}
							: null,
					},
				],
			},
		},
	}) as unknown as NextApiRequest;

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

describe("Bitbucket webhook with watch paths", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.stubGlobal("fetch", fetchMock);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.applicationsFindFirst.mockResolvedValue({
			applicationId: "application-id",
			sourceType: "bitbucket",
			autoDeploy: true,
			serverId: null,
			watchPaths: ["src/**"],
			bitbucketBranch: "main",
			bitbucketRepositorySlug: "web",
			bitbucket: { bitbucketWorkspaceName: "acme" },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("deploys when a push only deletes a watched file", async () => {
		fetchMock.mockResolvedValueOnce(
			json({ values: [diffstat("removed", "src/old.ts", null)] }),
		);
		const res = createResponse();

		await handler(pushRequest("del1"), res);

		expect(fetchMock).toHaveBeenCalledWith(
			`${API}/diffstat/del1..base0`,
			expect.anything(),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("deploys when a file is renamed out of a watched path", async () => {
		fetchMock.mockResolvedValueOnce(
			json({ values: [diffstat("renamed", "src/a.ts", "lib/a.ts")] }),
		);
		const res = createResponse();

		await handler(pushRequest("ren1"), res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("diffs the whole push, not just the tip commit", async () => {
		fetchMock.mockResolvedValueOnce(
			json({
				values: [
					diffstat("modified", "src/app.ts", "src/app.ts"),
					diffstat("modified", "README.md", "README.md"),
				],
			}),
		);
		const res = createResponse();

		await handler(pushRequest("c2"), res);

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
			`${API}/diffstat/c2..base0`,
			expect.anything(),
		);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("uses the single commit spec for a new branch", async () => {
		fetchMock.mockResolvedValueOnce(
			json({ values: [diffstat("modified", "src/app.ts", "src/app.ts")] }),
		);
		const res = createResponse();

		await handler(pushRequest("n1", null), res);

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
			`${API}/diffstat/n1`,
			expect.anything(),
		);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("follows diffstat pagination", async () => {
		fetchMock
			.mockResolvedValueOnce(
				json({
					values: [diffstat("modified", "docs/a.md", "docs/a.md")],
					next: `${API}/diffstat/p1..base0?page=2`,
				}),
			)
			.mockResolvedValueOnce(
				json({ values: [diffstat("modified", "src/late.ts", "src/late.ts")] }),
			);
		const res = createResponse();

		await handler(pushRequest("p1"), res);

		expect(fetchMock).toHaveBeenLastCalledWith(
			`${API}/diffstat/p1..base0?page=2`,
			expect.anything(),
		);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("skips when no changed path matches", async () => {
		fetchMock.mockResolvedValueOnce(
			json({ values: [diffstat("modified", "README.md", "README.md")] }),
		);
		const res = createResponse();

		await handler(pushRequest("r1"), res);

		expect(res.status).toHaveBeenCalledWith(301);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("deploys when the diffstat API fails", async () => {
		fetchMock.mockResolvedValueOnce(
			json({ type: "error", error: { message: "Something went wrong" } }, 500),
		);
		const res = createResponse();

		await handler(pushRequest("err1"), res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});
});
