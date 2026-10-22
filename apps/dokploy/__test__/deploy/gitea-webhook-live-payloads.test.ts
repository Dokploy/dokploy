import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These fixtures are real webhook deliveries captured from a Gitea 1.24.3
 * instance: a pull request was opened by a write collaborator, a second commit
 * was pushed to it, a label was added and then all labels were cleared. The
 * fifth delivery is a comment on that same pull request, which Gitea sends as
 * `X-Gitea-Event: issue_comment` even though its event *type* starts with
 * `pull_request` - Dokploy posts preview status comments itself, so those
 * deliveries must never be mistaken for pull request events.
 */
const deliveries: {
	headers: Record<string, string>;
	body: any;
}[] = JSON.parse(
	readFileSync(
		path.resolve(__dirname, "fixtures/gitea-pull-request-deliveries.json"),
		"utf8",
	),
);

const mocks = vi.hoisted(() => ({
	createPreviewDeployment: vi.fn(),
	createPreviewSecurityBlockedComment: vi.fn(),
	checkPreviewAuthorPermissions: vi.fn(),
	findPreviewDeploymentByApplicationId: vi.fn(),
	findPreviewDeploymentsByPullRequestId: vi.fn(),
	removePreviewDeployment: vi.fn(),
	queueAdd: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	checkPreviewAuthorPermissions: mocks.checkPreviewAuthorPermissions,
	createPreviewDeployment: mocks.createPreviewDeployment,
	createPreviewSecurityBlockedComment:
		mocks.createPreviewSecurityBlockedComment,
	findPreviewDeploymentByApplicationId:
		mocks.findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId:
		mocks.findPreviewDeploymentsByPullRequestId,
	getPreviewCommentContext: (application: any) =>
		application.giteaId && application.giteaOwner && application.giteaRepository
			? {
					provider: "gitea",
					providerId: application.giteaId,
					owner: application.giteaOwner,
					repository: application.giteaRepository,
				}
			: null,
	removePreviewDeployment: mocks.removePreviewDeployment,
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: mocks.queueAdd },
}));

vi.mock("@/server/utils/deploy", () => ({ deploy: vi.fn() }));

const { handleGiteaPullRequestEvent } = await import(
	"@/server/utils/gitea-preview"
);
const { isGiteaPullRequestEvent } = await import(
	"@/pages/api/deploy/[refreshToken]"
);

const byAction = (action: string) =>
	deliveries.find(
		(delivery) =>
			delivery.body.action === action &&
			delivery.headers["x-gitea-event"] === "pull_request",
	) as { headers: Record<string, string>; body: any };

const application = {
	applicationId: "app-1",
	name: "my-app",
	sourceType: "gitea",
	serverId: null,
	giteaId: "gitea-1",
	giteaOwner: "repoowner",
	giteaRepository: "web",
	giteaBranch: "main",
	isPreviewDeploymentsActive: true,
	previewLabels: null,
	previewLimit: 3,
	previewRequireCollaboratorPermissions: true,
	previewDeployments: [],
} as any;

describe("gitea webhook routing with real deliveries", () => {
	it("routes every pull request sub event, since Gitea folds them all into one event name", () => {
		const pullRequestDeliveries = deliveries.filter(
			(delivery) => delivery.headers["x-gitea-event"] === "pull_request",
		);

		expect(
			pullRequestDeliveries.map((d) => d.headers["x-gitea-event-type"]),
		).toEqual([
			"pull_request",
			"pull_request_sync",
			"pull_request_label",
			"pull_request_label",
		]);

		for (const delivery of pullRequestDeliveries) {
			expect(isGiteaPullRequestEvent(delivery.headers)).toBe(true);
		}
	});

	it("does not route a comment delivery as a pull request event", () => {
		const comment = deliveries.find(
			(delivery) => delivery.headers["x-gitea-event"] === "issue_comment",
		);

		expect(comment?.headers["x-gitea-event-type"]).toBe("pull_request_comment");
		expect(isGiteaPullRequestEvent(comment?.headers)).toBe(false);
	});

	it("ignores the GitHub compatibility header Gitea also sends", () => {
		expect(deliveries[0]?.headers["x-github-event"]).toBe("pull_request");
		expect(isGiteaPullRequestEvent({ "x-github-event": "pull_request" })).toBe(
			false,
		);
	});
});

describe("gitea preview deployments with real deliveries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPreviewAuthorPermissions.mockResolvedValue({
			hasWriteAccess: true,
			permission: "write",
			verified: true,
		});
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue(undefined);
		mocks.createPreviewDeployment.mockResolvedValue({
			previewDeploymentId: "preview-1",
		});
		mocks.findPreviewDeploymentsByPullRequestId.mockResolvedValue([]);
	});

	it("creates a preview from the 'opened' delivery", async () => {
		const { body } = byAction("opened");

		const result = await handleGiteaPullRequestEvent({ application, body });

		expect(result.status).toBe(200);
		expect(mocks.createPreviewDeployment).toHaveBeenCalledWith({
			applicationId: "app-1",
			branch: "feature/thing",
			pullRequestId: `${body.pull_request.id}`,
			pullRequestNumber: `${body.pull_request.number}`,
			pullRequestTitle: "Add a thing",
			pullRequestURL: body.pull_request.html_url,
		});
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				applicationType: "application-preview",
				previewDeploymentId: "preview-1",
			}),
			expect.anything(),
		);
	});

	it("redeploys the existing preview from the 'synchronized' delivery", async () => {
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue({
			previewDeploymentId: "preview-existing",
		});
		const { body } = byAction("synchronized");

		await handleGiteaPullRequestEvent({ application, body });

		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				previewDeploymentId: "preview-existing",
				descriptionLog: `Hash: ${body.pull_request.head.sha}`,
			}),
			expect.anything(),
		);
	});

	it("deploys on 'label_updated' but never creates a preview on 'label_cleared'", async () => {
		await handleGiteaPullRequestEvent({
			application,
			body: byAction("label_updated").body,
		});
		expect(mocks.createPreviewDeployment).toHaveBeenCalledTimes(1);

		vi.clearAllMocks();
		mocks.findPreviewDeploymentByApplicationId.mockResolvedValue(undefined);

		await handleGiteaPullRequestEvent({
			application,
			body: byAction("label_cleared").body,
		});
		expect(mocks.createPreviewDeployment).not.toHaveBeenCalled();
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("rejects a real delivery aimed at a different repository", async () => {
		const result = await handleGiteaPullRequestEvent({
			application: { ...application, giteaRepository: "other" },
			body: byAction("opened").body,
		});

		expect(result.status).toBe(400);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});
});
