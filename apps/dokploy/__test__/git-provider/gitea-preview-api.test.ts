import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the HTTP surface of the Gitea helpers is under test here, so provider
// lookup and token refresh are stubbed out.
const mockFindGiteaById = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: mockFindGiteaById,
	updateGitea: vi.fn(),
}));

const {
	checkGiteaUserRepositoryPermissions,
	cloneGiteaRepository,
	createGiteaIssueComment,
	giteaIssueCommentExists,
	updateGiteaIssueComment,
} = await import("@dokploy/server/utils/providers/gitea");

const { getPreviewCommentContext } = await import(
	"@dokploy/server/services/preview-comment"
);

const jsonResponse = (body: unknown, status = 200) =>
	({
		ok: status >= 200 && status < 300,
		status,
		statusText: `status ${status}`,
		json: async () => body,
		text: async () => JSON.stringify(body),
	}) as unknown as Response;

const fetchMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);
	mockFindGiteaById.mockResolvedValue({
		giteaId: "gitea-1",
		giteaUrl: "https://gitea.example.com",
		giteaInternalUrl: null,
		accessToken: "gitea-token",
		refreshToken: null,
		clientId: null,
		clientSecret: null,
	});
});

describe("getPreviewCommentContext", () => {
	it("maps a github application to the github provider", () => {
		expect(
			getPreviewCommentContext({
				sourceType: "github",
				githubId: "gh-1",
				owner: "acme",
				repository: "web",
			}),
		).toEqual({
			provider: "github",
			providerId: "gh-1",
			owner: "acme",
			repository: "web",
		});
	});

	it("maps a gitea application to the gitea provider", () => {
		expect(
			getPreviewCommentContext({
				sourceType: "gitea",
				giteaId: "gitea-1",
				giteaOwner: "acme",
				giteaRepository: "web",
			}),
		).toEqual({
			provider: "gitea",
			providerId: "gitea-1",
			owner: "acme",
			repository: "web",
		});
	});

	it("returns null for source types that cannot host preview deployments", () => {
		expect(getPreviewCommentContext({ sourceType: "docker" })).toBeNull();
		expect(
			getPreviewCommentContext({
				sourceType: "git",
				customGitUrl: "https://gitea.example.com/acme/web.git",
			} as never),
		).toBeNull();
		// A gitea application that is not fully configured yet.
		expect(
			getPreviewCommentContext({ sourceType: "gitea", giteaId: "gitea-1" }),
		).toBeNull();
	});
});

describe("gitea issue comment helpers", () => {
	it("creates a comment on the pull request index and returns its id", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ id: 987 }));

		const comment = await createGiteaIssueComment({
			giteaId: "gitea-1",
			owner: "acme",
			repository: "web",
			index: 7,
			body: "hello",
		});

		expect(comment.id).toBe(987);
		const [url, init] = fetchMock.mock.calls[0] as [
			string,
			{ method: string; headers: Record<string, string>; body: string },
		];
		expect(url).toBe(
			"https://gitea.example.com/api/v1/repos/acme/web/issues/7/comments",
		);
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("token gitea-token");
		expect(JSON.parse(init.body)).toEqual({ body: "hello" });
	});

	it("updates a comment by its own id, not by the pull request index", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ id: 987 }));

		await updateGiteaIssueComment({
			giteaId: "gitea-1",
			owner: "acme",
			repository: "web",
			commentId: 987,
			body: "updated",
		});

		const [url, init] = fetchMock.mock.calls[0] as [
			string,
			{ method: string; headers: Record<string, string>; body: string },
		];
		expect(url).toBe(
			"https://gitea.example.com/api/v1/repos/acme/web/issues/comments/987",
		);
		expect(init.method).toBe("PATCH");
	});

	it("prefers the internal url when one is configured", async () => {
		mockFindGiteaById.mockResolvedValue({
			giteaUrl: "https://gitea.example.com",
			giteaInternalUrl: "http://gitea:3000/",
			accessToken: "gitea-token",
		});
		fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));

		await createGiteaIssueComment({
			giteaId: "gitea-1",
			owner: "acme",
			repository: "web",
			index: 7,
			body: "hello",
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"http://gitea:3000/api/v1/repos/acme/web/issues/7/comments",
		);
	});

	it("reports a deleted comment as missing", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ message: "not found" }, 404));

		await expect(
			giteaIssueCommentExists({
				giteaId: "gitea-1",
				owner: "acme",
				repository: "web",
				commentId: 987,
			}),
		).resolves.toBe(false);
	});
});

describe("checkGiteaUserRepositoryPermissions", () => {
	it.each([
		["write", true],
		["admin", true],
		["owner", true],
		["read", false],
		["none", false],
	])("treats '%s' as write access: %s", async (permission, hasWriteAccess) => {
		fetchMock.mockResolvedValue(jsonResponse({ permission }));

		await expect(
			checkGiteaUserRepositoryPermissions(
				"gitea-1",
				"acme",
				"web",
				"contributor",
			),
		).resolves.toEqual({ hasWriteAccess, permission, verified: true });
	});

	// On a public repository Gitea reports a non-collaborator as `read` rather
	// than 404, which the `read` case above already covers.
	it("treats a 404 as a verified 'no permission'", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ message: "not found" }, 404));

		await expect(
			checkGiteaUserRepositoryPermissions(
				"gitea-1",
				"acme",
				"web",
				"contributor",
			),
		).resolves.toEqual({
			hasWriteAccess: false,
			permission: null,
			verified: true,
		});
	});

	it("reports a 403 as unverified, since Dokploy itself lacks access", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ message: "forbidden" }, 403));

		await expect(
			checkGiteaUserRepositoryPermissions(
				"gitea-1",
				"acme",
				"web",
				"contributor",
			),
		).resolves.toEqual({
			hasWriteAccess: false,
			permission: null,
			verified: false,
		});
	});
});

describe("cloneGiteaRepository", () => {
	it("fails with a clear message when the provider is not authorized", async () => {
		mockFindGiteaById.mockResolvedValue({
			giteaUrl: "https://gitea.example.com",
			giteaInternalUrl: null,
			accessToken: null,
		});

		const command = await cloneGiteaRepository({
			appName: "preview-app",
			giteaBranch: "feature",
			giteaId: "gitea-1",
			giteaOwner: "acme",
			giteaRepository: "web",
			enableSubmodules: false,
			serverId: null,
		});

		expect(command).toContain("not authorized");
		expect(command).not.toContain("git clone");
	});

	it("fails instead of cloning a repository with a missing owner", async () => {
		const command = await cloneGiteaRepository({
			appName: "preview-app",
			giteaBranch: "feature",
			giteaId: "gitea-1",
			giteaOwner: null,
			giteaRepository: "web",
			enableSubmodules: false,
			serverId: null,
		});

		expect(command).toContain("Owner not specified");
		expect(command).not.toContain("git clone");
	});

	it("clones the preview branch of the configured repository", async () => {
		const command = await cloneGiteaRepository({
			appName: "preview-app",
			giteaBranch: "feature/thing",
			giteaId: "gitea-1",
			giteaOwner: "acme",
			giteaRepository: "web",
			enableSubmodules: false,
			serverId: null,
		});

		expect(command).toContain("--branch feature/thing");
		expect(command).toContain(
			"oauth2\\:gitea-token\\@gitea.example.com/acme/web.git",
		);
	});
});
