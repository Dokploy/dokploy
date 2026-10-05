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
	listCheckSuites: vi.fn(),
	areCheckSuitesPassing: vi.fn(),
	getChangedFiles: vi.fn(),
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
		waitForChecks: "application.waitForChecks",
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
		waitForChecks: "compose.waitForChecks",
	},
	github: {
		githubInstallationId: "github.githubInstallationId",
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
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
	listCheckSuites: mocks.listCheckSuites,
	areCheckSuitesPassing: mocks.areCheckSuitesPassing,
	getChangedFiles: mocks.getChangedFiles,
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

	const passingSuite = {
		head_sha: "abc123",
		status: "completed",
		conclusion: "success",
		latest_check_runs_count: 1,
	};

	const createCheckSuiteRequest = (
		action: string,
		checkSuite: Record<string, unknown> = {},
	) =>
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
					before: "before123",
					after: "abc123",
					status: action === "completed" ? "completed" : "queued",
					conclusion: action === "completed" ? "success" : null,
					head_commit: {
						id: "abc123",
						message: "fix: trigger deployment",
					},
					...checkSuite,
				},
				repository: {
					name: "dokploy",
					owner: {
						login: "agentHits",
					},
				},
			},
		}) as unknown as NextApiRequest;

	const waitingApplication = {
		applicationId: "application-id",
		serverId: null,
		watchPaths: null,
		waitForChecks: true,
	};

	const waitingCompose = {
		composeId: "compose-id",
		serverId: null,
		watchPaths: null,
		waitForChecks: true,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.githubFindFirst.mockResolvedValue(githubProvider);
		mocks.verify.mockResolvedValue(true);
		mocks.shouldDeploy.mockReturnValue(true);
		mocks.applicationsFindMany.mockResolvedValue([]);
		mocks.composeFindMany.mockResolvedValue([]);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.listCheckSuites.mockResolvedValue([passingSuite]);
		mocks.areCheckSuitesPassing.mockReturnValue(true);
		mocks.getChangedFiles.mockResolvedValue(["src/index.ts"]);
		mocks.isCloud = false;
		mocks.deploy.mockResolvedValue({});
	});

	it("does not deploy a push when the application waits for checks", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 0 apps, 1 waiting for checks",
		});
	});

	it("does not deploy a push when the compose service waits for checks", async () => {
		mocks.composeFindMany.mockResolvedValue([waitingCompose]);
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 0 apps, 1 waiting for checks",
		});
	});

	it("still deploys the other services of the push", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			waitingApplication,
			{ applicationId: "other-id", serverId: null, waitForChecks: false },
		]);
		const res = createResponse();

		await handler(createPushRequest("main"), res);

		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({ applicationId: "other-id" }),
			expect.anything(),
		);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 1 apps, 1 waiting for checks",
		});
	});

	it("keeps deploying tag pushes right away", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		const res = createResponse();

		await handler(createTagRequest("v1.0.0"), res);

		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 1 apps based on tag v1.0.0",
		});
	});

	it("looks up the services waiting for checks on the branch of the suite", async () => {
		mocks.applicationsFindMany.mockImplementation(({ where }) => {
			const matches =
				getConditionValue(where, "application.sourceType") === "github" &&
				getConditionValue(where, "application.autoDeploy") === true &&
				getConditionValue(where, "application.triggerType") === "push" &&
				getConditionValue(where, "application.waitForChecks") === true &&
				getConditionValue(where, "application.branch") === "main" &&
				getConditionValue(where, "application.repository") === "dokploy" &&
				getConditionValue(where, "application.owner") === "agentHits" &&
				getConditionValue(where, "application.githubId") ===
					"github-provider-id";

			return Promise.resolve(matches ? [waitingApplication] : []);
		});
		mocks.composeFindMany.mockImplementation(({ where }) => {
			const matches =
				getConditionValue(where, "compose.sourceType") === "github" &&
				getConditionValue(where, "compose.autoDeploy") === true &&
				getConditionValue(where, "compose.triggerType") === "push" &&
				getConditionValue(where, "compose.waitForChecks") === true &&
				getConditionValue(where, "compose.branch") === "main" &&
				getConditionValue(where, "compose.repository") === "dokploy" &&
				getConditionValue(where, "compose.owner") === "agentHits" &&
				getConditionValue(where, "compose.githubId") === "github-provider-id";

			return Promise.resolve(matches ? [waitingCompose] : []);
		});
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).toHaveBeenCalledTimes(2);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 2 apps after checks passed",
		});
	});

	it("deploys the application once every suite on the commit passed", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.listCheckSuites).toHaveBeenCalledWith(
			githubProvider,
			"agentHits",
			"dokploy",
			"heads/main",
		);
		expect(mocks.areCheckSuitesPassing).toHaveBeenCalledWith([passingSuite]);
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

	it("deploys compose services the same way", async () => {
		mocks.composeFindMany.mockResolvedValue([waitingCompose]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			{
				composeId: "compose-id",
				titleLog: "fix: trigger deployment",
				descriptionLog: "Hash: abc123",
				type: "deploy",
				applicationType: "compose",
				server: false,
			},
			expect.anything(),
		);
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 1 apps after checks passed",
		});
	});

	it("does not deploy while checks are running or failed", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		mocks.areCheckSuitesPassing.mockReturnValue(false);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Checks have not all passed yet",
		});
	});

	it("does not deploy when a newer push replaced the commit on the branch", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		mocks.listCheckSuites.mockResolvedValue([
			{ ...passingSuite, head_sha: "def456" },
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.areCheckSuitesPassing).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Commit is no longer the head of the branch",
		});
	});

	it("does not call the GitHub API when nothing waits on the branch", async () => {
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.listCheckSuites).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "No apps waiting for checks",
		});
	});

	it("ignores check_suite actions other than completed", async () => {
		const res = createResponse();

		await handler(createCheckSuiteRequest("requested"), res);

		expect(mocks.applicationsFindMany).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Ignored check_suite action requested",
		});
	});

	it("ignores suites without a branch", async () => {
		const res = createResponse();

		await handler(
			createCheckSuiteRequest("completed", { head_branch: null }),
			res,
		);

		expect(mocks.applicationsFindMany).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Ignored check_suite without a branch",
		});
	});

	it("honours skip keywords in the commit message", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		const res = createResponse();

		await handler(
			createCheckSuiteRequest("completed", {
				head_commit: { id: "abc123", message: "chore: bump [skip ci]" },
			}),
			res,
		);

		expect(mocks.applicationsFindMany).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployment skipped: commit message contains skip keyword",
		});
	});

	it("compares the pushed commits once when a service has watch paths", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			{ ...waitingApplication, watchPaths: ["src/**"] },
			{
				...waitingApplication,
				applicationId: "docs-id",
				watchPaths: ["docs/**"],
			},
			{ ...waitingApplication, applicationId: "plain-id" },
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.getChangedFiles).toHaveBeenCalledTimes(1);
		expect(mocks.getChangedFiles).toHaveBeenCalledWith(
			githubProvider,
			"agentHits",
			"dokploy",
			"before123",
			"abc123",
		);
		expect(mocks.shouldDeploy).toHaveBeenCalledWith(
			["src/**"],
			["src/index.ts"],
		);
		expect(mocks.shouldDeploy).toHaveBeenCalledWith(
			["docs/**"],
			["src/index.ts"],
		);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(3);
	});

	it("skips services whose watch paths did not change", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			{ ...waitingApplication, watchPaths: ["docs/**"] },
		]);
		mocks.shouldDeploy.mockReturnValue(false);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			message: "Deployed 0 apps after checks passed",
		});
	});

	it("does not compare commits when no service has watch paths", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			{ ...waitingApplication, watchPaths: [] },
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.getChangedFiles).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("deploys without comparing when the branch has no previous commit", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			{ ...waitingApplication, watchPaths: ["src/**"] },
		]);
		const res = createResponse();

		await handler(
			createCheckSuiteRequest("completed", {
				before: "0000000000000000000000000000000000000000",
			}),
			res,
		);

		expect(mocks.getChangedFiles).not.toHaveBeenCalled();
		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("dispatches to the cloud deployment service", async () => {
		mocks.isCloud = true;
		mocks.applicationsFindMany.mockResolvedValue([
			{ ...waitingApplication, serverId: "server-id" },
		]);
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

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

	it("answers 400 when the GitHub API call fails", async () => {
		mocks.applicationsFindMany.mockResolvedValue([waitingApplication]);
		mocks.listCheckSuites.mockRejectedValue(new Error("boom"));
		const res = createResponse();

		await handler(createCheckSuiteRequest("completed"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			message: "Error deploying after checks passed",
		});
	});
});
