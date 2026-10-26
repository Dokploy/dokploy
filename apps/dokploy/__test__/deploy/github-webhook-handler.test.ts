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
	queueGetJobs: vi.fn(),
	verify: vi.fn(),
	shouldDeploy: vi.fn(),
	checkUserRepositoryPermissions: vi.fn(),
	findOrCreatePreviewDeployment: vi.fn(),
	findPreviewDeploymentByApplicationId: vi.fn(),
	removePreviewDeployment: vi.fn(),
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
	IS_CLOUD: false,
	shouldDeploy: mocks.shouldDeploy,
	checkUserRepositoryPermissions: mocks.checkUserRepositoryPermissions,
	createSecurityBlockedComment: vi.fn(),
	findGithubById: vi.fn(),
	findOrCreatePreviewDeployment: mocks.findOrCreatePreviewDeployment,
	findPreviewDeploymentByApplicationId:
		mocks.findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId: vi.fn(),
	getBitbucketHeaders: vi.fn(() => ({})),
	removePreviewDeployment: mocks.removePreviewDeployment,
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
		getJobs: mocks.queueGetJobs,
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
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

	it("passes serverId to queued jobs for remote servers", async () => {
		mocks.applicationsFindMany.mockImplementation(({ where }) => {
			const matches =
				getConditionValue(where, "application.sourceType") === "github" &&
				getConditionValue(where, "application.autoDeploy") === true &&
				getConditionValue(where, "application.triggerType") === "push" &&
				getConditionValue(where, "application.branch") === "main";

			return Promise.resolve(
				matches
					? [
							{
								applicationId: "remote-app-id",
								serverId: "remote-server-id",
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
				applicationId: "remote-app-id",
				applicationType: "application",
				server: true,
				serverId: "remote-server-id",
			}),
			expect.anything(),
		);
		expect(res.status).toHaveBeenCalledWith(200);
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
		previewRequireCollaboratorPermissions: false,
		...overrides,
	});

	const createPullRequestRequest = (
		action: string,
		{ labels = [], label }: { labels?: string[]; label?: string } = {},
	) =>
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
				...(label ? { label: { name: label } } : {}),
				pull_request: {
					id: 987,
					number: 42,
					title: "feat: add preview",
					html_url: "https://github.com/agentHits/dokploy/pull/42",
					labels: labels.map((name) => ({ name })),
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

	const previewJob = (previewDeploymentId: string, sha: string) => ({
		data: {
			applicationId: "application-id",
			applicationType: "application-preview",
			type: "deploy",
			titleLog: "Preview Deployment",
			descriptionLog: `Hash: ${sha}`,
			previewDeploymentId,
		},
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.githubFindFirst.mockResolvedValue({
			githubId: "github-provider-id",
			githubInstallationId: 12345,
			githubWebhookSecret: "webhook-secret",
		});
		mocks.verify.mockResolvedValue(true);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.queueGetJobs.mockResolvedValue([]);
		mocks.checkUserRepositoryPermissions.mockResolvedValue({
			hasWriteAccess: true,
			permission: "admin",
		});
		mocks.findOrCreatePreviewDeployment.mockResolvedValue({
			previewDeployment: { previewDeploymentId: "new-preview-id" },
			created: true,
		});
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue(undefined);
		mocks.applicationsFindMany.mockResolvedValue([createApplication()]);
	});

	it("creates and deploys a preview when a pull request is opened", async () => {
		const res = createResponse();

		await handler(createPullRequestRequest("opened"), res);

		expect(mocks.findOrCreatePreviewDeployment).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "application-id",
				branch: "feature",
				pullRequestId: 987,
				pullRequestNumber: 42,
			}),
			3,
		);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationId: "application-id",
				applicationType: "application-preview",
				previewDeploymentId: "new-preview-id",
				descriptionLog: "Hash: abc123",
				type: "deploy",
			}),
			expect.objectContaining({
				removeOnComplete: true,
				removeOnFail: true,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ message: "Apps Deployed" });
	});

	it("passes the configured limit and redeploys an existing preview", async () => {
		mocks.applicationsFindMany.mockResolvedValue([
			createApplication({ previewLimit: 2 }),
		]);
		mocks.findOrCreatePreviewDeployment.mockResolvedValue({
			previewDeployment: { previewDeploymentId: "existing-preview-0" },
			created: false,
		});
		const res = createResponse();

		await handler(createPullRequestRequest("synchronize"), res);

		expect(mocks.findOrCreatePreviewDeployment).toHaveBeenCalledWith(
			expect.objectContaining({ pullRequestId: 987 }),
			2,
		);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				previewDeploymentId: "existing-preview-0",
				type: "deploy",
			}),
			expect.anything(),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("does not deploy when the limit prevented a new preview", async () => {
		mocks.findOrCreatePreviewDeployment.mockResolvedValue({
			previewDeployment: null,
			created: false,
		});
		const res = createResponse();

		await handler(createPullRequestRequest("opened"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("does not queue a second build of a commit that is already queued", async () => {
		mocks.queueGetJobs.mockResolvedValue([
			previewJob("new-preview-id", "abc123"),
		]);
		const res = createResponse();

		await handler(createPullRequestRequest("opened"), res);

		expect(mocks.queueGetJobs).toHaveBeenCalledWith(["waiting", "active"]);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("queues a build of a new commit while an older one is running", async () => {
		mocks.queueGetJobs.mockResolvedValue([
			previewJob("new-preview-id", "older-sha"),
			previewJob("other-preview-id", "abc123"),
		]);
		const res = createResponse();

		await handler(createPullRequestRequest("synchronize"), res);

		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	describe("with preview labels configured", () => {
		beforeEach(() => {
			mocks.applicationsFindMany.mockResolvedValue([
				createApplication({
					previewLabels: ["preview"],
					previewRequireCollaboratorPermissions: true,
				}),
			]);
		});

		it("deploys when the preview label is added", async () => {
			const res = createResponse();

			await handler(
				createPullRequestRequest("labeled", {
					labels: ["preview"],
					label: "preview",
				}),
				res,
			);

			expect(mocks.checkUserRepositoryPermissions).toHaveBeenCalledTimes(1);
			expect(mocks.findOrCreatePreviewDeployment).toHaveBeenCalledTimes(1);
			expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
			expect(res.json).toHaveBeenCalledWith({ message: "Apps Deployed" });
		});

		it("ignores a label that is not a preview label being added", async () => {
			const res = createResponse();

			await handler(
				createPullRequestRequest("labeled", {
					labels: ["preview", "lgtm"],
					label: "lgtm",
				}),
				res,
			);

			expect(mocks.checkUserRepositoryPermissions).not.toHaveBeenCalled();
			expect(mocks.findOrCreatePreviewDeployment).not.toHaveBeenCalled();
			expect(mocks.queueAdd).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ message: "No apps to deploy" });
		});

		it("ignores a label that is not a preview label being removed", async () => {
			mocks.findPreviewDeploymentByApplicationId.mockResolvedValue({
				previewDeploymentId: "existing-preview-0",
			});
			const res = createResponse();

			await handler(
				createPullRequestRequest("unlabeled", {
					labels: ["preview"],
					label: "lgtm",
				}),
				res,
			);

			expect(mocks.removePreviewDeployment).not.toHaveBeenCalled();
			expect(mocks.queueAdd).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(200);
		});

		it("does not deploy a pull request without the preview label", async () => {
			const res = createResponse();

			await handler(
				createPullRequestRequest("synchronize", { labels: ["lgtm"] }),
				res,
			);

			expect(mocks.checkUserRepositoryPermissions).not.toHaveBeenCalled();
			expect(mocks.findOrCreatePreviewDeployment).not.toHaveBeenCalled();
			expect(mocks.queueAdd).not.toHaveBeenCalled();
		});

		it("removes the preview when the preview label is removed", async () => {
			mocks.findPreviewDeploymentByApplicationId.mockResolvedValue({
				previewDeploymentId: "existing-preview-0",
			});
			const res = createResponse();

			await handler(
				createPullRequestRequest("unlabeled", {
					labels: ["lgtm"],
					label: "preview",
				}),
				res,
			);

			expect(mocks.findPreviewDeploymentByApplicationId).toHaveBeenCalledWith(
				"application-id",
				987,
			);
			expect(mocks.removePreviewDeployment).toHaveBeenCalledWith(
				"existing-preview-0",
			);
			expect(mocks.queueAdd).not.toHaveBeenCalled();
			expect(res.json).toHaveBeenCalledWith({
				message: "Removed 1 preview deployments",
			});
		});

		it("keeps the preview while another preview label remains", async () => {
			mocks.applicationsFindMany.mockResolvedValue([
				createApplication({ previewLabels: ["preview", "deploy"] }),
			]);
			const res = createResponse();

			await handler(
				createPullRequestRequest("unlabeled", {
					labels: ["deploy"],
					label: "preview",
				}),
				res,
			);

			expect(mocks.removePreviewDeployment).not.toHaveBeenCalled();
			expect(mocks.queueAdd).not.toHaveBeenCalled();
		});
	});

	it("ignores label events when no preview labels are configured", async () => {
		const res = createResponse();

		await handler(
			createPullRequestRequest("labeled", { labels: ["lgtm"], label: "lgtm" }),
			res,
		);

		expect(mocks.findOrCreatePreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({ message: "No apps to deploy" });
	});
});
