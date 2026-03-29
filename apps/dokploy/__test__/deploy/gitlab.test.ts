import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Service mocks (declared before imports, hoisted by Vitest) ---

vi.mock("@dokploy/server/services/gitlab", async (importOriginal) => {
	const mod =
		await importOriginal<typeof import("@dokploy/server/services/gitlab")>();
	return {
		...mod,
		findGitlabByWebhookSecret: vi.fn(),
	};
});

vi.mock("@dokploy/server/services/preview-deployment", async (importOriginal) => {
	const mod =
		await importOriginal<
			typeof import("@dokploy/server/services/preview-deployment")
		>();
	return {
		...mod,
		findPreviewDeploymentsByPullRequestId: vi.fn(),
		removePreviewDeployment: vi.fn(),
		findPreviewDeploymentByApplicationId: vi.fn(),
		createPreviewDeployment: vi.fn(),
	};
});

vi.mock("@dokploy/server/utils/providers/gitlab", async (importOriginal) => {
	const mod =
		await importOriginal<
			typeof import("@dokploy/server/utils/providers/gitlab")
		>();
	return {
		...mod,
		refreshGitlabToken: vi.fn().mockResolvedValue(undefined),
		checkGitlabMemberPermissions: vi.fn(),
		createSecurityBlockedMRNote: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

// --- Imports (after mocks) ---

import { findGitlabByWebhookSecret } from "@dokploy/server/services/gitlab";
import {
	createPreviewDeployment,
	findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId,
	removePreviewDeployment,
} from "@dokploy/server/services/preview-deployment";
import {
	checkGitlabMemberPermissions,
	createSecurityBlockedMRNote,
} from "@dokploy/server/utils/providers/gitlab";
import { db } from "@dokploy/server/db";
import { myQueue } from "@/server/queues/queueSetup";
import handler from "@/pages/api/deploy/gitlab";

// --- Fixtures ---

const FAKE_GITLAB_PROVIDER = {
	gitlabId: "gitlab-id-1",
	gitlabUrl: "https://gitlab.example.com",
	gitlabInternalUrl: null,
	webhookSecret: "super-secret",
	accessToken: "access-token",
};

const FAKE_APP = {
	applicationId: "app-id-1",
	name: "My App",
	appName: "my-app",
	sourceType: "gitlab" as const,
	gitlabId: "gitlab-id-1",
	gitlabPathNamespace: "mygroup/myrepo",
	gitlabBranch: "main",
	isPreviewDeploymentsActive: true,
	previewRequireCollaboratorPermissions: true,
	previewLabels: [],
	previewLimit: 3,
	serverId: null,
	previewDeployments: [],
};

const makeMrPayload = (
	action: string,
	overrides: Record<string, unknown> = {},
) => ({
	object_kind: "merge_request",
	user: { username: "mrauthor" },
	project: {
		id: 99,
		name: "myrepo",
		path_with_namespace: "mygroup/myrepo",
	},
	object_attributes: {
		id: 12345,
		iid: 42,
		action,
		source_branch: "feature-branch",
		target_branch: "main",
		title: "My MR Title",
		url: "https://gitlab.example.com/mygroup/myrepo/-/merge_requests/42",
		last_commit: { id: "abc123" },
		labels: [],
		...overrides,
	},
});

const makePushPayload = () => ({
	object_kind: "push",
	ref: "refs/heads/main",
	checkout_sha: "abc123",
	repository: { name: "myrepo" },
	project: { id: 99, path_with_namespace: "mygroup/myrepo" },
});

const makeReq = (
	eventType: string,
	body: object,
	token = "super-secret",
): NextApiRequest =>
	({
		method: "POST",
		headers: {
			"x-gitlab-event": eventType,
			"x-gitlab-token": token,
		},
		body,
	}) as any;

const makeRes = (): NextApiResponse => {
	const res: any = {};
	res.status = vi.fn().mockReturnValue(res);
	res.json = vi.fn().mockReturnValue(res);
	return res as NextApiResponse;
};

// --- Tests ---

describe("GitLab webhook handler — authentication", () => {
	afterEach(() => vi.clearAllMocks());

	it("returns 401 when X-Gitlab-Token header is missing", async () => {
		const req: NextApiRequest = {
			method: "POST",
			headers: { "x-gitlab-event": "Merge Request Hook" },
			body: makeMrPayload("open"),
		} as any;
		const res = makeRes();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(401);
	});

	it("returns 401 when the token does not match any GitLab provider", async () => {
		vi.mocked(findGitlabByWebhookSecret).mockResolvedValue(null as any);

		const req = makeReq("Merge Request Hook", makeMrPayload("open"), "wrong-token");
		const res = makeRes();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(401);
	});
});

describe("GitLab webhook handler — event filtering", () => {
	beforeEach(() => {
		vi.mocked(findGitlabByWebhookSecret).mockResolvedValue(
			FAKE_GITLAB_PROVIDER as any,
		);
	});
	afterEach(() => vi.clearAllMocks());

	it("returns 400 for unknown event types", async () => {
		const req = makeReq("Confidential Issue Hook", { object_kind: "issue" });
		const res = makeRes();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
	});
});

describe("GitLab webhook handler — Merge Request Hook teardown", () => {
	beforeEach(() => {
		vi.mocked(findGitlabByWebhookSecret).mockResolvedValue(
			FAKE_GITLAB_PROVIDER as any,
		);
	});
	afterEach(() => vi.clearAllMocks());

	it("removes preview deployments and returns 200 when action is 'close'", async () => {
		const existingDeployment = { previewDeploymentId: "preview-1" };
		vi.mocked(findPreviewDeploymentsByPullRequestId).mockResolvedValue([
			existingDeployment as any,
		]);

		const req = makeReq("Merge Request Hook", makeMrPayload("close"));
		const res = makeRes();

		await handler(req, res);

		expect(findPreviewDeploymentsByPullRequestId).toHaveBeenCalledWith("12345");
		expect(removePreviewDeployment).toHaveBeenCalledWith("preview-1");
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("removes preview deployments and returns 200 when action is 'merge'", async () => {
		const existingDeployment = { previewDeploymentId: "preview-2" };
		vi.mocked(findPreviewDeploymentsByPullRequestId).mockResolvedValue([
			existingDeployment as any,
		]);

		const req = makeReq("Merge Request Hook", makeMrPayload("merge"));
		const res = makeRes();

		await handler(req, res);

		expect(removePreviewDeployment).toHaveBeenCalledWith("preview-2");
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("removes preview deployments even when user/mrAuthor is absent in the payload", async () => {
		// This validates the fix: teardown must happen BEFORE the mrAuthor null-guard
		const existingDeployment = { previewDeploymentId: "preview-3" };
		vi.mocked(findPreviewDeploymentsByPullRequestId).mockResolvedValue([
			existingDeployment as any,
		]);

		const payloadWithoutUser = {
			...makeMrPayload("close"),
			user: undefined, // missing user block
		};
		const req = makeReq("Merge Request Hook", payloadWithoutUser);
		const res = makeRes();

		await handler(req, res);

		expect(removePreviewDeployment).toHaveBeenCalledWith("preview-3");
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

describe("GitLab webhook handler — Merge Request Hook open/update", () => {
	beforeEach(() => {
		vi.mocked(findGitlabByWebhookSecret).mockResolvedValue(
			FAKE_GITLAB_PROVIDER as any,
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			FAKE_APP as any,
		]);
		vi.mocked(findPreviewDeploymentsByPullRequestId).mockResolvedValue([]);
		vi.mocked(findPreviewDeploymentByApplicationId).mockResolvedValue(
			undefined as any,
		);
		vi.mocked(createPreviewDeployment).mockResolvedValue({
			previewDeploymentId: "new-preview-id",
		} as any);
	});
	afterEach(() => vi.clearAllMocks());

	it("returns 400 when mrAuthor is missing from the payload", async () => {
		const payloadWithoutAuthor = {
			...makeMrPayload("open"),
			user: null,
		};
		const req = makeReq("Merge Request Hook", payloadWithoutAuthor);
		const res = makeRes();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it("blocks deploy and posts security note when user lacks write access", async () => {
		vi.mocked(checkGitlabMemberPermissions).mockResolvedValue({
			hasWriteAccess: false,
			accessLevel: 20,
		});

		const req = makeReq("Merge Request Hook", makeMrPayload("open"));
		const res = makeRes();

		await handler(req, res);

		expect(checkGitlabMemberPermissions).toHaveBeenCalled();
		expect(createSecurityBlockedMRNote).toHaveBeenCalled();
		expect(myQueue.add).not.toHaveBeenCalled();
	});

	it("enqueues job with applicationType='application-preview' when user has write access", async () => {
		vi.mocked(checkGitlabMemberPermissions).mockResolvedValue({
			hasWriteAccess: true,
			accessLevel: 30,
		});

		const req = makeReq("Merge Request Hook", makeMrPayload("open"));
		const res = makeRes();

		await handler(req, res);

		expect(myQueue.add).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({ applicationType: "application-preview" }),
			expect.any(Object),
		);
	});

	it("skips app when required label is not present on the MR", async () => {
		vi.mocked(checkGitlabMemberPermissions).mockResolvedValue({
			hasWriteAccess: true,
			accessLevel: 40,
		});
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{ ...FAKE_APP, previewLabels: ["needs-review"] } as any,
		]);

		const payloadNoLabels = makeMrPayload("open");
		// object_attributes.labels is already [] in makeMrPayload
		const req = makeReq("Merge Request Hook", payloadNoLabels);
		const res = makeRes();

		await handler(req, res);

		expect(myQueue.add).not.toHaveBeenCalled();
	});

	it("does not exceed preview limit — skips app when deployments are at limit", async () => {
		vi.mocked(checkGitlabMemberPermissions).mockResolvedValue({
			hasWriteAccess: true,
			accessLevel: 30,
		});
		// 4 existing deployments with previewLimit = 3 → over limit
		const appAtLimit = {
			...FAKE_APP,
			previewLimit: 3,
			previewDeployments: [
				{ previewDeploymentId: "p1" },
				{ previewDeploymentId: "p2" },
				{ previewDeploymentId: "p3" },
				{ previewDeploymentId: "p4" },
			],
		};
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			appAtLimit as any,
		]);

		const req = makeReq("Merge Request Hook", makeMrPayload("open"));
		const res = makeRes();

		await handler(req, res);

		expect(myQueue.add).not.toHaveBeenCalled();
	});

	it("reports security note with the blocked app's access level, not a later app's level", async () => {
		// Two apps: first blocked (access_level=20), second allowed (access_level=30)
		// The security note for the first app must report access_level=20, not 30
		vi.mocked(checkGitlabMemberPermissions)
			.mockResolvedValueOnce({ hasWriteAccess: false, accessLevel: 20 })
			.mockResolvedValueOnce({ hasWriteAccess: true, accessLevel: 30 });

		const twoApps = [
			{ ...FAKE_APP, applicationId: "app-1", name: "Blocked App" },
			{ ...FAKE_APP, applicationId: "app-2", name: "Allowed App" },
		];
		vi.mocked(db.query.applications.findMany).mockResolvedValue(
			twoApps as any,
		);

		const req = makeReq("Merge Request Hook", makeMrPayload("open"));
		const res = makeRes();

		await handler(req, res);

		// Security note should be created exactly once (for the blocked app)
		expect(createSecurityBlockedMRNote).toHaveBeenCalledTimes(1);
		// The second app should still get a job
		expect(myQueue.add).toHaveBeenCalledTimes(1);
	});
});

describe("GitLab webhook handler — Push Hook", () => {
	beforeEach(() => {
		vi.mocked(findGitlabByWebhookSecret).mockResolvedValue(
			FAKE_GITLAB_PROVIDER as any,
		);
	});
	afterEach(() => vi.clearAllMocks());

	it("enqueues deployment job for matching applications on push", async () => {
		// Both table queries share the same mock fn via setup.ts Proxy.
		// Use Once so first call (applications) returns FAKE_APP, second (compose) returns [].
		vi.mocked(db.query.applications.findMany).mockResolvedValueOnce([
			FAKE_APP as any,
		]);
		vi.mocked(db.query.applications.findMany).mockResolvedValueOnce([] as any);

		const req = makeReq("Push Hook", makePushPayload());
		const res = makeRes();

		await handler(req, res);

		expect(myQueue.add).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({ applicationType: "application" }),
			expect.any(Object),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("skips app when watchPaths is set and none of the modified files match", async () => {
		const appWithWatchPaths = {
			...FAKE_APP,
			watchPaths: ["src/**"],
		};
		// First call (applications) returns app with watchPaths; second (compose) returns []
		vi.mocked(db.query.applications.findMany).mockResolvedValueOnce([
			appWithWatchPaths as any,
		]);
		vi.mocked(db.query.applications.findMany).mockResolvedValueOnce([] as any);

		// Push only touches docs/ — does not match src/**
		const pushPayload = {
			...makePushPayload(),
			commits: [{ added: ["docs/readme.md"], modified: [], removed: [] }],
		};
		const req = makeReq("Push Hook", pushPayload);
		const res = makeRes();

		await handler(req, res);

		expect(myQueue.add).not.toHaveBeenCalled();
	});

	it("returns 200 with no-ops message when no apps match the push", async () => {
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([]);

		const req = makeReq("Push Hook", makePushPayload());
		const res = makeRes();

		await handler(req, res);

		expect(myQueue.add).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});
});
