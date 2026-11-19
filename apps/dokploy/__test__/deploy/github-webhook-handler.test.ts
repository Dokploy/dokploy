import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
	and: vi.fn((...conditions: Array<{ field: string; value: unknown }>) => ({
		conditions,
	})),
	or: vi.fn((...alternatives: Array<{ field: string; value: unknown }>) => ({
		alternatives,
	})),
	githubFindFirst: vi.fn(),
	applicationsFindMany: vi.fn(),
	composeFindMany: vi.fn(),
	queueAdd: vi.fn(),
	verify: vi.fn(),
	shouldDeploy: vi.fn(),
	createPreviewDeployment: vi.fn(),
	findPreviewDeploymentByApplicationId: vi.fn(),
	checkUserRepositoryPermissions: vi.fn(),
	createSecurityBlockedComment: vi.fn(),
	listPullRequests: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
	and: mocks.and,
	or: mocks.or,
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
		previewStackedPullRequests: "application.previewStackedPullRequests",
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

vi.mock("@dokploy/server", async () => ({
	...(await vi.importActual<
		typeof import("@dokploy/server/utils/providers/github-stacked-pull-requests")
	>("@dokploy/server/utils/providers/github-stacked-pull-requests")),
	IS_CLOUD: false,
	shouldDeploy: mocks.shouldDeploy,
	authGithub: vi.fn(() => ({
		rest: { pulls: { list: mocks.listPullRequests } },
	})),
	checkUserRepositoryPermissions: mocks.checkUserRepositoryPermissions,
	createPreviewDeployment: mocks.createPreviewDeployment,
	createSecurityBlockedComment: mocks.createSecurityBlockedComment,
	findGithubById: vi.fn(async () => ({ githubId: "github-provider-id" })),
	findPreviewDeploymentByApplicationId:
		mocks.findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId: vi.fn(),
	getBitbucketHeaders: vi.fn(() => ({})),
	removePreviewDeployment: vi.fn(),
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
		branch: "main",
		serverId: null,
		previewLabels: [],
		previewLimit: 3,
		previewDeployments: [],
		previewRequireCollaboratorPermissions: false,
		previewStackedPullRequests: false,
		...overrides,
	});

	type Condition =
		| { field: string; value: unknown }
		| { alternatives: Condition[] };

	// Fixture keys stand in for columns, so the mocked query only returns the
	// applications that the real where clause would select.
	const matchesCondition = (
		app: Record<string, unknown>,
		condition: Condition,
	): boolean => {
		if ("alternatives" in condition) {
			return condition.alternatives.some((alternative) =>
				matchesCondition(app, alternative),
			);
		}
		const key = condition.field.replace("application.", "");
		return !(key in app) || app[key] === condition.value;
	};

	const useApplications = (apps: Array<Record<string, unknown>>) => {
		mocks.applicationsFindMany.mockImplementation(
			async ({ where }: { where: { conditions: Condition[] } }) =>
				apps.filter((app) =>
					where.conditions.every((condition) =>
						matchesCondition(app, condition),
					),
				),
		);
	};

	const createPreviewDeployments = (total: number) =>
		Array.from({ length: total }, (_, index) => ({
			previewDeploymentId: `existing-preview-${index}`,
		}));

	const createPullRequestRequest = (
		action: string,
		pullRequest: {
			id?: number;
			number?: number;
			head?: string;
			base?: string;
			labels?: Array<{ name: string }>;
		} = {},
		extraBody: Record<string, unknown> = {},
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
				...extraBody,
				pull_request: {
					id: pullRequest.id ?? 987,
					number: pullRequest.number ?? 42,
					title: "feat: add preview",
					html_url: "https://github.com/agentHits/dokploy/pull/42",
					labels: pullRequest.labels ?? [],
					user: {
						login: "agentHits",
					},
					head: {
						ref: pullRequest.head ?? "feature",
						sha: "abc123",
					},
					base: {
						ref: pullRequest.base ?? "main",
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
		mocks.listPullRequests.mockResolvedValue({ data: [] });
	});

	const useOpenPullRequests = (
		pullRequests: Array<{ head: string; base: string }>,
	) => {
		mocks.listPullRequests.mockImplementation(
			async ({ head }: { head: string }) => ({
				data: pullRequests
					.filter((pullRequest) => `agentHits:${pullRequest.head}` === head)
					.map((pullRequest) => ({ base: { ref: pullRequest.base } })),
			}),
		);
	};

	// main <- foundation <- inbox-list <- operator-status
	const stack = [
		{ id: 1, number: 1, head: "foundation", base: "main" },
		{ id: 2, number: 2, head: "inbox-list", base: "foundation" },
		{ id: 3, number: 3, head: "operator-status", base: "inbox-list" },
	];

	it.each(stack)(
		"creates a preview for pull request #$number of a stack",
		async (pullRequest) => {
			useOpenPullRequests(stack);
			useApplications([
				createApplication({ previewStackedPullRequests: true }),
			]);
			const res = createResponse();

			await handler(createPullRequestRequest("opened", pullRequest), res);

			expect(mocks.createPreviewDeployment).toHaveBeenCalledWith(
				expect.objectContaining({
					applicationId: "application-id",
					branch: pullRequest.head,
					pullRequestId: pullRequest.id,
					pullRequestNumber: pullRequest.number,
				}),
			);
			expect(mocks.queueAdd).toHaveBeenCalledWith(
				"deployments",
				expect.objectContaining({
					applicationType: "application-preview",
					previewDeploymentId: "new-preview-id",
				}),
				expect.anything(),
			);
			expect(res.status).toHaveBeenCalledWith(200);
		},
	);

	it("queries applications on the base branch or with stacked previews enabled", async () => {
		useApplications([]);

		await handler(createPullRequestRequest("opened"), createResponse());

		expect(mocks.or).toHaveBeenCalledWith(
			{ field: "application.branch", value: "main" },
			{ field: "application.previewStackedPullRequests", value: true },
		);
	});

	it("does not create a preview for a pull request into a branch outside any stack", async () => {
		useOpenPullRequests([]);
		useApplications([createApplication({ previewStackedPullRequests: true })]);
		const res = createResponse();

		await handler(
			createPullRequestRequest("opened", { head: "hotfix", base: "release" }),
			res,
		);

		expect(mocks.listPullRequests).toHaveBeenCalledWith(
			expect.objectContaining({ head: "agentHits:release", state: "open" }),
		);
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("does not create a preview when the stack is a cycle", async () => {
		useOpenPullRequests([
			{ head: "a", base: "b" },
			{ head: "b", base: "a" },
		]);
		useApplications([createApplication({ previewStackedPullRequests: true })]);

		await handler(
			createPullRequestRequest("opened", { head: "c", base: "a" }),
			createResponse(),
		);

		expect(mocks.listPullRequests).toHaveBeenCalledTimes(2);
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
	});

	it("does not create a preview when the stack is deeper than the limit", async () => {
		const deepStack = Array.from({ length: 11 }, (_, index) => ({
			head: `branch-${index + 1}`,
			base: index === 0 ? "main" : `branch-${index}`,
		}));
		useOpenPullRequests(deepStack);
		useApplications([createApplication({ previewStackedPullRequests: true })]);

		await handler(
			createPullRequestRequest("opened", {
				head: "branch-12",
				base: "branch-11",
			}),
			createResponse(),
		);

		expect(mocks.listPullRequests).toHaveBeenCalledTimes(10);
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
	});

	it("keeps the previous behavior when stacked previews are disabled", async () => {
		useOpenPullRequests(stack);
		useApplications([createApplication()]);

		await handler(
			createPullRequestRequest("opened", stack[1]),
			createResponse(),
		);

		expect(mocks.listPullRequests).not.toHaveBeenCalled();
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("does not query GitHub for a pull request into the application branch", async () => {
		useApplications([createApplication({ previewStackedPullRequests: true })]);

		await handler(createPullRequestRequest("opened"), createResponse());

		expect(mocks.listPullRequests).not.toHaveBeenCalled();
		expect(mocks.createPreviewDeployment).toHaveBeenCalled();
	});

	it("skips stacked previews when the stack lookup fails", async () => {
		mocks.listPullRequests.mockRejectedValue(new Error("rate limited"));
		useApplications([createApplication({ previewStackedPullRequests: true })]);
		const res = createResponse();

		await handler(createPullRequestRequest("opened", stack[1]), res);

		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("checks the author permissions of a stacked pull request", async () => {
		useOpenPullRequests(stack);
		mocks.checkUserRepositoryPermissions.mockResolvedValue({
			hasWriteAccess: false,
			permission: "read",
		});
		useApplications([
			createApplication({
				previewStackedPullRequests: true,
				previewRequireCollaboratorPermissions: true,
			}),
		]);

		await handler(
			createPullRequestRequest("opened", stack[2]),
			createResponse(),
		);

		expect(mocks.checkUserRepositoryPermissions).toHaveBeenCalled();
		expect(mocks.createSecurityBlockedComment).toHaveBeenCalled();
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
	});

	it("checks the preview labels of a stacked pull request", async () => {
		useOpenPullRequests(stack);
		useApplications([
			createApplication({
				previewStackedPullRequests: true,
				previewLabels: ["preview"],
			}),
		]);

		await handler(
			createPullRequestRequest("opened", stack[2]),
			createResponse(),
		);
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();

		await handler(
			createPullRequestRequest("labeled", {
				...stack[2],
				labels: [{ name: "preview" }],
			}),
			createResponse(),
		);
		expect(mocks.createPreviewDeployment).toHaveBeenCalledWith(
			expect.objectContaining({ branch: "operator-status" }),
		);
	});

	it("creates a preview when a pull request is retargeted to the application branch", async () => {
		useApplications([createApplication()]);
		const res = createResponse();

		await handler(
			createPullRequestRequest(
				"edited",
				{ id: 2, number: 2, head: "inbox-list", base: "main" },
				{ changes: { base: { ref: { from: "foundation" } } } },
			),
			res,
		);

		expect(mocks.createPreviewDeployment).toHaveBeenCalledWith(
			expect.objectContaining({
				branch: "inbox-list",
				pullRequestId: 2,
			}),
		);
		expect(mocks.queueAdd).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("redeploys the existing preview when the base of a stacked pull request changes", async () => {
		useApplications([createApplication({ previewStackedPullRequests: true })]);
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue({
			previewDeploymentId: "existing-preview",
		});

		await handler(
			createPullRequestRequest(
				"edited",
				{ id: 2, number: 2, head: "inbox-list", base: "main" },
				{ changes: { base: { ref: { from: "foundation" } } } },
			),
			createResponse(),
		);

		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({ previewDeploymentId: "existing-preview" }),
			expect.anything(),
		);
	});

	it("ignores edits that do not change the base branch", async () => {
		useApplications([createApplication()]);
		const res = createResponse();

		await handler(
			createPullRequestRequest(
				"edited",
				{},
				{ changes: { title: { from: "old title" } } },
			),
			res,
		);

		expect(mocks.applicationsFindMany).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it("redeploys an existing preview even when the limit is reached", async () => {
		useApplications([
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
		useApplications([
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
		useApplications([
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
