import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
	and: vi.fn((...conditions: Array<{ field: string; value: unknown }>) => ({
		conditions,
	})),
	githubFindFirst: vi.fn(),
	applicationsFindMany: vi.fn(),
	composeFindMany: vi.fn(),
	queueAdd: vi.fn(),
	verify: vi.fn(),
	shouldDeploy: vi.fn(),
	createPreviewDeployment: vi.fn(),
	findPreviewDeploymentByApplicationId: vi.fn(),
	createPendingGithubDeployment: vi.fn(),
	findPendingGithubDeploymentsBySha: vi.fn(),
	removePendingGithubDeployment: vi.fn(),
	haveAllChecksPassed: vi.fn(),
	tx: { marker: "transaction" },
	dbTransaction: vi.fn(),
	deploy: vi.fn(),
	isCloud: false,
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
	and: mocks.and,
}));

vi.mock("@/server/db/schema", () => ({
	applications: {
		sourceType: "application.sourceType",
		autoDeploy: "application.autoDeploy",
		triggerType: "application.triggerType",
		branch: "application.branch",
		repository: "application.repository",
		owner: "application.owner",
		githubId: "application.githubId",
		isPreviewDeploymentsActive: "application.isPreviewDeploymentsActive",
	},
	compose: {
		sourceType: "compose.sourceType",
		autoDeploy: "compose.autoDeploy",
		triggerType: "compose.triggerType",
		branch: "compose.branch",
		repository: "compose.repository",
		owner: "compose.owner",
		githubId: "compose.githubId",
	},
	github: {
		githubInstallationId: "github.githubInstallationId",
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: mocks.dbTransaction,
		query: {
			github: {
				findFirst: mocks.githubFindFirst,
			},
			applications: {
				findMany: mocks.applicationsFindMany,
			},
			compose: {
				findMany: mocks.composeFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return mocks.isCloud;
	},
	shouldDeploy: mocks.shouldDeploy,
	checkUserRepositoryPermissions: vi.fn(),
	createPreviewDeployment: mocks.createPreviewDeployment,
	createSecurityBlockedComment: vi.fn(),
	findGithubById: vi.fn(),
	findPreviewDeploymentByApplicationId:
		mocks.findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId: vi.fn(),
	getBitbucketHeaders: vi.fn(() => ({})),
	removePreviewDeployment: vi.fn(),
	createPendingGithubDeployment: mocks.createPendingGithubDeployment,
	findPendingGithubDeploymentsBySha: mocks.findPendingGithubDeploymentsBySha,
	removePendingGithubDeployment: mocks.removePendingGithubDeployment,
	haveAllChecksPassed: mocks.haveAllChecksPassed,
}));

vi.mock("@octokit/webhooks", () => ({
	Webhooks: vi.fn().mockImplementation(function Webhooks() {
		return {
			verify: mocks.verify,
		};
	}),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: {
		add: mocks.queueAdd,
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: mocks.deploy,
}));

import handler from "@/pages/api/deploy/github";

const getConditionValue = (
	where: { conditions?: Array<{ field: string; value: unknown }> } | undefined,
	field: string,
) => where?.conditions?.find((condition) => condition.field === field)?.value;

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

const createPushRequest = (
	branch: string,
	owner: { login?: string; name?: string } = { login: "agentHits" },
) =>
	({
		headers: {
			"x-hub-signature-256": "sha256=test-signature",
			"x-github-event": "push",
		},
		body: {
			installation: {
				id: 12345,
			},
			ref: `refs/heads/${branch}`,
			after: "abc123",
			head_commit: {
				id: "abc123",
				message: "fix: trigger deployment",
			},
			commits: [
				{
					modified: ["src/index.ts"],
				},
			],
			repository: {
				name: "dokploy",
				full_name: "agentHits/dokploy",
				clone_url: "https://github.com/agentHits/dokploy.git",
				html_url: "https://github.com/agentHits/dokploy",
				owner,
			},
		},
	}) as unknown as NextApiRequest;

const createTagRequest = (tagName: string) => {
	const req = createPushRequest("main") as unknown as {
		body: { ref: string; head_commit: { message: string } };
	};

	req.body.ref = `refs/tags/${tagName}`;
	req.body.head_commit.message = `release: ${tagName}`;

	return req as unknown as NextApiRequest;
};

describe("GitHub app webhook auto-deploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.githubFindFirst.mockResolvedValue({
			githubId: "github-provider-id",
			githubInstallationId: 12345,
			githubWebhookSecret: "webhook-secret",
		});
		mocks.verify.mockResolvedValue(true);
		mocks.shouldDeploy.mockReturnValue(true);
		mocks.composeFindMany.mockResolvedValue([]);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });

		mocks.applicationsFindMany.mockImplementation(({ where }) => {
			const matches =
				getConditionValue(where, "application.sourceType") === "github" &&
				getConditionValue(where, "application.autoDeploy") === true &&
				getConditionValue(where, "application.triggerType") === "push" &&
				getConditionValue(where, "application.branch") === "main" &&
				getConditionValue(where, "application.repository") === "dokploy" &&
				getConditionValue(where, "application.owner") === "agentHits" &&
				getConditionValue(where, "application.githubId") ===
					"github-provider-id";

			return Promise.resolve(
				matches
					? [
							{
								applicationId: "application-id",
								serverId: null,
								watchPaths: null,
							},
						]
					: [],
			);
		});
	});

	it("matches push events using repository owner name when available", async () => {
		const res = createResponse();

		await handler(
			createPushRequest("main", {
				login: "agentHits-login",
				name: "agentHits",
			}),
			res,
		);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				applicationType: "application",
				type: "deploy",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ message: "Deployed 1 apps" });
	});

	it("matches compose push events using repository owner login fallback", async () => {
		mocks.applicationsFindMany.mockResolvedValue([]);
		mocks.composeFindMany.mockImplementation(({ where }) => {
			const matches =
				getConditionValue(where, "compose.sourceType") === "github" &&
				getConditionValue(where, "compose.autoDeploy") === true &&
				getConditionValue(where, "compose.triggerType") === "push" &&
				getConditionValue(where, "compose.branch") === "main" &&
				getConditionValue(where, "compose.repository") === "dokploy" &&
				getConditionValue(where, "compose.owner") === "agentHits" &&
				getConditionValue(where, "compose.githubId") === "github-provider-id";

			return Promise.resolve(
				matches
					? [
							{
								composeId: "compose-id",
								serverId: null,
								watchPaths: null,
							},
						]
					: [],
			);
		});
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationType: "compose",
				composeId: "compose-id",
				type: "deploy",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ message: "Deployed 1 apps" });
	});

	it("matches tag events using repository owner login fallback", async () => {
		mocks.applicationsFindMany.mockImplementation(({ where }) => {
			const matches =
				getConditionValue(where, "application.sourceType") === "github" &&
				getConditionValue(where, "application.autoDeploy") === true &&
				getConditionValue(where, "application.triggerType") === "tag" &&
				getConditionValue(where, "application.repository") === "dokploy" &&
				getConditionValue(where, "application.owner") === "agentHits" &&
				getConditionValue(where, "application.githubId") ===
					"github-provider-id";

			return Promise.resolve(
				matches
					? [
							{
								applicationId: "application-id",
								serverId: null,
							},
						]
					: [],
			);
		});
		const res = createResponse();

		await handler(createTagRequest("v1.0.0"), res);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				applicationType: "application",
				titleLog: "Tag created: v1.0.0",
				type: "deploy",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 1 apps based on tag v1.0.0",
		});
	});

	it("does not deploy when the pushed branch does not match", async () => {
		const res = createResponse();

		await handler(createPushRequest("feature"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ message: "No apps to deploy" });
	});
});

describe("GitHub app webhook preview deployments", () => {
	const createApplication = (
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> => ({
		applicationId: "application-id",
		name: "my-app",
		serverId: null,
		previewLabels: [],
		previewLimit: 3,
		previewDeployments: [],
		previewRequireCollaboratorPermissions: false,
		...overrides,
	});

	const createPreviewDeployments = (total: number) =>
		Array.from({ length: total }, (_, index) => ({
			previewDeploymentId: `existing-preview-${index}`,
		}));

	const createPullRequestRequest = (action: string) =>
		({
			headers: {
				"x-hub-signature-256": "sha256=test-signature",
				"x-github-event": "pull_request",
			},
			body: {
				installation: {
					id: 12345,
				},
				action,
				pull_request: {
					id: 987,
					number: 42,
					title: "feat: add preview",
					html_url: "https://github.com/agentHits/dokploy/pull/42",
					labels: [],
					user: {
						login: "agentHits",
					},
					head: {
						ref: "feature",
						sha: "abc123",
					},
					base: {
						ref: "main",
					},
				},
				repository: {
					name: "dokploy",
					owner: {
						login: "agentHits",
					},
				},
			},
		}) as unknown as NextApiRequest;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.githubFindFirst.mockResolvedValue({
			githubId: "github-provider-id",
			githubInstallationId: 12345,
			githubWebhookSecret: "webhook-secret",
		});
		mocks.verify.mockResolvedValue(true);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.createPreviewDeployment.mockResolvedValue({
			previewDeploymentId: "new-preview-id",
		});
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue(undefined);
	});

	it("redeploys an existing preview even when the limit is reached", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			createApplication({
				previewLimit: 2,
				previewDeployments: createPreviewDeployments(3),
			}),
		]);
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue({
			previewDeploymentId: "existing-preview-0",
		});
		const res = createResponse();

		await handler(createPullRequestRequest("synchronize"), res);

		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				applicationType: "application-preview",
				previewDeploymentId: "existing-preview-0",
				type: "deploy",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("does not create a new preview once the limit is reached", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			createApplication({
				previewLimit: 2,
				previewDeployments: createPreviewDeployments(2),
			}),
		]);
		const res = createResponse();

		await handler(createPullRequestRequest("opened"), res);

		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("falls back to the default limit when none is configured", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			createApplication({
				previewLimit: null,
				previewDeployments: createPreviewDeployments(2),
			}),
		]);
		const res = createResponse();

		await handler(createPullRequestRequest("opened"), res);

		expect(mocks.createPreviewDeployment).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "application-id",
				branch: "feature",
				pullRequestId: 987,
				pullRequestNumber: 42,
			}),
		);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				applicationType: "application-preview",
				previewDeploymentId: "new-preview-id",
				type: "deploy",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

describe("GitHub app webhook wait for checks", () => {
	const githubProvider = {
		githubId: "github-provider-id",
		githubInstallationId: 12345,
		githubWebhookSecret: "webhook-secret",
	};

	const createCheckSuiteRequest = (action: string) =>
		({
			headers: {
				"x-hub-signature-256": "sha256=test-signature",
				"x-github-event": "check_suite",
			},
			body: {
				installation: {
					id: 12345,
				},
				action,
				check_suite: {
					head_sha: "abc123",
					head_branch: "main",
					status: action === "completed" ? "completed" : "queued",
					conclusion: action === "completed" ? "success" : null,
					latest_check_runs_count: 1,
				},
				repository: {
					name: "dokploy",
					owner: {
						login: "agentHits",
					},
				},
			},
		}) as unknown as NextApiRequest;

	const parkedApplication = {
		pendingGithubDeploymentId: "pending-id",
		headSha: "abc123",
		titleLog: "fix: trigger deployment",
		descriptionLog: "Hash: abc123",
		applicationId: "application-id",
		composeId: null,
		application: {
			applicationId: "application-id",
			githubId: "github-provider-id",
			serverId: null,
			owner: "agentHits",
			repository: "dokploy",
		},
		compose: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.githubFindFirst.mockResolvedValue(githubProvider);
		mocks.verify.mockResolvedValue(true);
		mocks.shouldDeploy.mockReturnValue(true);
		mocks.applicationsFindMany.mockResolvedValue([]);
		mocks.composeFindMany.mockResolvedValue([]);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.createPendingGithubDeployment.mockResolvedValue({});
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([]);
		mocks.removePendingGithubDeployment.mockResolvedValue(parkedApplication);
		mocks.haveAllChecksPassed.mockResolvedValue(true);
		mocks.dbTransaction.mockImplementation(
			async (callback: (tx: unknown) => Promise<unknown>) => callback(mocks.tx),
		);
		mocks.isCloud = false;
		mocks.deploy.mockResolvedValue({});
	});

	it("parks the push instead of deploying when the application waits for checks", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			{ applicationId: "application-id", serverId: null, waitForChecks: true },
		]);
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.createPendingGithubDeployment).toHaveBeenCalledWith({
			applicationId: "application-id",
			headSha: "abc123",
			titleLog: "fix: trigger deployment",
			descriptionLog: "Hash: abc123",
		});
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 0 apps, 1 waiting for checks",
		});
	});

	it("still honours watch paths before parking a push", async () => {
		mocks.shouldDeploy.mockReturnValue(false);
		mocks.applicationsFindMany.mockResolvedValue([
			{
				applicationId: "application-id",
				serverId: null,
				watchPaths: ["src/**"],
				waitForChecks: true,
			},
		]);
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.createPendingGithubDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("parks compose services the same way", async () => {
		mocks.composeFindMany.mockResolvedValue([
			{ composeId: "compose-id", serverId: null, waitForChecks: true },
		]);
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.createPendingGithubDeployment).toHaveBeenCalledWith({
			composeId: "compose-id",
			headSha: "abc123",
			titleLog: "fix: trigger deployment",
			descriptionLog: "Hash: abc123",
		});
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("parks tag pushes when the application waits for checks", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			{ applicationId: "application-id", serverId: null, waitForChecks: true },
		]);
		const res = createResponse();

		await handler(createTagRequest("v1.0.0"), res);

		expect(mocks.createPendingGithubDeployment).toHaveBeenCalledWith({
			applicationId: "application-id",
			headSha: "abc123",
			titleLog: "Tag created: v1.0.0",
			descriptionLog: "Hash: abc123",
		});
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 0 apps based on tag v1.0.0, 1 waiting for checks",
		});
	});

	it("deploys the parked application once every check on the commit passed", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			parkedApplication,
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.findPendingGithubDeploymentsBySha).toHaveBeenCalledWith(
			"abc123",
		);
		expect(mocks.haveAllChecksPassed).toHaveBeenCalledWith(
			githubProvider,
			"agentHits",
			"dokploy",
			"abc123",
		);
		expect(mocks.removePendingGithubDeployment).toHaveBeenCalledWith(
			"pending-id",
			mocks.tx,
		);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			{
				applicationId: "application-id",
				titleLog: "fix: trigger deployment",
				descriptionLog: "Hash: abc123",
				type: "deploy",
				applicationType: "application",
				server: false,
			},
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 1 apps after checks passed",
		});
	});

	it("deploys a parked compose service", async () => {
		const parkedCompose = {
			...parkedApplication,
			applicationId: null,
			application: null,
			composeId: "compose-id",
			compose: {
				composeId: "compose-id",
				githubId: "github-provider-id",
				serverId: null,
				owner: "agentHits",
				repository: "dokploy",
			},
		};
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([parkedCompose]);
		mocks.removePendingGithubDeployment.mockResolvedValue(parkedCompose);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				composeId: "compose-id",
				applicationType: "compose",
				type: "deploy",
			}),
			expect.anything(),
		);
	});

	it("keeps the deployment parked while checks are running or failed", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			parkedApplication,
		]);
		mocks.haveAllChecksPassed.mockResolvedValue(false);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.removePendingGithubDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Checks have not all passed yet",
		});
	});

	it("does not call the GitHub API when nothing is parked for the commit", async () => {
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.haveAllChecksPassed).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "No pending deployments for this commit",
		});
	});

	it("ignores parked deployments that belong to another GitHub provider", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			{
				...parkedApplication,
				application: { ...parkedApplication.application, githubId: "other" },
			},
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.haveAllChecksPassed).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("ignores check_suite actions other than completed", async () => {
		const res = createResponse();

		await handler(createCheckSuiteRequest("requested"), res);

		expect(mocks.findPendingGithubDeploymentsBySha).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Ignored check_suite action requested",
		});
	});

	it("ignores parked deployments of a service that deploys another repository", async () => {
		// Forks and mirrors share commit shas with the original repository.
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			{
				...parkedApplication,
				application: {
					...parkedApplication.application,
					owner: "someone-else",
					repository: "dokploy",
				},
			},
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.haveAllChecksPassed).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "No pending deployments for this commit",
		});
	});

	it("matches the repository case-insensitively", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			{
				...parkedApplication,
				application: {
					...parkedApplication.application,
					owner: "AgentHits",
					repository: "Dokploy",
				},
			},
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("consumes the row and queues the job inside one transaction", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			parkedApplication,
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);
		expect(mocks.removePendingGithubDeployment).toHaveBeenCalledWith(
			"pending-id",
			mocks.tx,
		);
	});

	it("fails the request when the queue rejects the job so the row is rolled back", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			parkedApplication,
		]);
		mocks.queueAdd.mockRejectedValue(new Error("redis down"));
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it("dispatches to the cloud deployment service inside the transaction", async () => {
		mocks.isCloud = true;
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			{
				...parkedApplication,
				application: {
					...parkedApplication.application,
					serverId: "server-id",
				},
			},
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);
		expect(mocks.deploy).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "application-id",
				serverId: "server-id",
			}),
		);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 1 apps after checks passed",
		});
	});

	it("fails the request when the cloud dispatch rejects so the row is rolled back", async () => {
		mocks.isCloud = true;
		mocks.deploy.mockRejectedValue(new Error("Server is inactive"));
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			{
				...parkedApplication,
				application: {
					...parkedApplication.application,
					serverId: "server-id",
				},
			},
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it("does not deploy twice when another suite already consumed the row", async () => {
		mocks.findPendingGithubDeploymentsBySha.mockResolvedValue([
			parkedApplication,
		]);
		mocks.removePendingGithubDeployment.mockResolvedValue(undefined);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 0 apps after checks passed",
		});
	});
});
