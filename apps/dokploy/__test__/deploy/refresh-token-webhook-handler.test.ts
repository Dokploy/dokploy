import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applicationsFindFirst: vi.fn(),
	composeFindFirst: vi.fn(),
	queueAdd: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
}));

vi.mock("@/server/db/schema", () => ({
	applications: {
		refreshToken: "application.refreshToken",
	},
	compose: {
		refreshToken: "compose.refreshToken",
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: mocks.applicationsFindFirst,
			},
			compose: {
				findFirst: mocks.composeFindFirst,
			},
		},
	},
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	shouldDeploy: vi.fn(() => true),
	getBitbucketHeaders: vi.fn(() => ({})),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: {
		add: mocks.queueAdd,
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
}));

import applicationHandler from "@/pages/api/deploy/[refreshToken]";
import composeHandler from "@/pages/api/deploy/compose/[refreshToken]";

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

const createGitlabPushRequest = () =>
	({
		query: {
			refreshToken: "refresh-token",
		},
		headers: {
			"x-gitlab-event": "Push Hook",
		},
		body: {
			ref: "refs/heads/main",
			checkout_sha: "abc123",
			commits: [
				{
					message: "fix: trigger deployment",
					modified: ["src/index.ts"],
				},
			],
		},
	}) as unknown as NextApiRequest;

describe("Refresh token webhook auto-deploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
	});

	it("queues the application deployment on the server of the application", async () => {
		mocks.applicationsFindFirst.mockResolvedValue({
			applicationId: "application-id",
			autoDeploy: true,
			sourceType: "gitlab",
			gitlabBranch: "main",
			watchPaths: null,
			serverId: "server-id",
		});
		const res = createResponse();

		await applicationHandler(createGitlabPushRequest(), res);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				serverId: "server-id",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("queues the compose deployment on the server of the compose", async () => {
		mocks.composeFindFirst.mockResolvedValue({
			composeId: "compose-id",
			autoDeploy: true,
			sourceType: "gitlab",
			gitlabBranch: "main",
			watchPaths: null,
			serverId: "server-id",
		});
		const res = createResponse();

		await composeHandler(createGitlabPushRequest(), res);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				composeId: "compose-id",
				serverId: "server-id",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});
