import {
	signGitProviderOAuthState,
	verifyGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
	createGithub: vi.fn(),
	findGithubById: vi.fn(),
	findGiteaById: vi.fn(),
	findGitlabById: vi.fn(),
	updateGithub: vi.fn(),
	updateGitea: vi.fn(),
	updateGitlab: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
	validateRequest: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
	update: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateReturning: vi.fn(),
}));

const octokitMocks = vi.hoisted(() => ({
	request: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createGithub: providerMocks.createGithub,
	findGithubById: providerMocks.findGithubById,
	findGiteaById: providerMocks.findGiteaById,
	findGitlabById: providerMocks.findGitlabById,
	updateGithub: providerMocks.updateGithub,
	updateGitea: providerMocks.updateGitea,
	updateGitlab: providerMocks.updateGitlab,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: authMocks.validateRequest,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: dbMocks.update,
	},
}));

vi.mock("octokit", () => ({
	Octokit: class {
		request = octokitMocks.request;
	},
}));

const { default: githubSetupHandler } = await import(
	"../../pages/api/providers/github/setup"
);
const { default: giteaAuthorizeHandler } = await import(
	"../../pages/api/providers/gitea/authorize"
);
const { default: giteaCallbackHandler } = await import(
	"../../pages/api/providers/gitea/callback"
);
const { default: gitlabAuthorizeHandler } = await import(
	"../../pages/api/providers/gitlab/authorize"
);
const { default: gitlabCallbackHandler } = await import(
	"../../pages/api/providers/gitlab/callback"
);

const gitlabProvider = {
	gitlabId: "gitlab-1",
	gitProviderId: "git-provider-1",
	applicationId: "gitlab-client",
	secret: "gitlab-secret",
	redirectUri: "https://dokploy.example.com/api/providers/gitlab/callback",
	gitlabUrl: "https://gitlab.example.com",
	gitlabInternalUrl: null,
	gitProvider: {
		gitProviderId: "git-provider-1",
		organizationId: "org-1",
		userId: "user-1",
	},
};

const giteaProvider = {
	giteaId: "gitea-1",
	gitProviderId: "git-provider-1",
	clientId: "gitea-client",
	clientSecret: "gitea-secret",
	redirectUri: "https://dokploy.example.com/api/providers/gitea/callback",
	giteaUrl: "https://gitea.example.com",
	giteaInternalUrl: null,
	gitProvider: {
		gitProviderId: "git-provider-1",
		organizationId: "org-1",
		userId: "user-1",
	},
};

const githubProvider = {
	githubId: "github-1",
	githubAppName: "https://github.com/apps/dokploy-test",
	githubInstallationId: null,
	gitProviderId: "git-provider-1",
	gitProvider: {
		gitProviderId: "git-provider-1",
		organizationId: "org-1",
		userId: "user-1",
	},
};

const oauthSession = {
	id: "session-1",
	userId: "user-1",
	activeOrganizationId: "org-1",
};

const oauthUser = {
	id: "user-1",
	role: "owner",
};

const sessionBinding = {
	sessionId: oauthSession.id,
	userId: oauthSession.userId,
	organizationId: oauthSession.activeOrganizationId,
};

const createResponse = () => {
	const response = {
		statusCode: 200,
		headers: {} as Record<string, string>,
		body: undefined as unknown,
		status: vi.fn((code: number) => {
			response.statusCode = code;
			return response;
		}),
		json: vi.fn((body: unknown) => {
			response.body = body;
			return response;
		}),
		redirect: vi.fn((statusOrUrl: number | string, maybeUrl?: string) => {
			if (typeof statusOrUrl === "number") {
				response.statusCode = statusOrUrl;
				response.headers.location = maybeUrl ?? "";
			} else {
				response.statusCode = 307;
				response.headers.location = statusOrUrl;
			}
			return response;
		}),
	} as unknown as NextApiResponse & {
		statusCode: number;
		headers: Record<string, string>;
		body: unknown;
		status: ReturnType<typeof vi.fn>;
		json: ReturnType<typeof vi.fn>;
		redirect: ReturnType<typeof vi.fn>;
	};

	return response;
};

const createRequest = (
	query: Record<string, string | undefined>,
	method = "GET",
) =>
	({
		method,
		query,
	}) as unknown as NextApiRequest;

describe("Git provider OAuth state callback boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbMocks.update.mockReturnValue({
			set: dbMocks.updateSet,
		});
		dbMocks.updateSet.mockReturnValue({
			where: dbMocks.updateWhere,
		});
		dbMocks.updateWhere.mockReturnValue({
			returning: dbMocks.updateReturning,
		});
		dbMocks.updateReturning.mockResolvedValue([{ githubId: "github-1" }]);
		octokitMocks.request.mockResolvedValue({
			data: {
				name: "Dokploy App",
				html_url: "https://github.com/apps/dokploy-test",
				id: 123,
				client_id: "github-client",
				client_secret: "github-secret",
				webhook_secret: "webhook-secret",
				pem: "private-key",
			},
		});
		providerMocks.createGithub.mockResolvedValue({ githubId: "github-1" });
		providerMocks.findGithubById.mockResolvedValue(githubProvider);
		providerMocks.updateGithub.mockResolvedValue({ githubId: "github-1" });
		providerMocks.findGitlabById.mockResolvedValue(gitlabProvider);
		providerMocks.findGiteaById.mockResolvedValue(giteaProvider);
		providerMocks.updateGitlab.mockResolvedValue({ gitlabId: "gitlab-1" });
		providerMocks.updateGitea.mockResolvedValue({ giteaId: "gitea-1" });
		authMocks.validateRequest.mockResolvedValue({
			session: oauthSession,
			user: oauthUser,
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					access_token: "access-token",
					refresh_token: "refresh-token",
					expires_in: 3600,
				}),
				text: async () =>
					JSON.stringify({
						access_token: "access-token",
						refresh_token: "refresh-token",
						expires_in: 3600,
					}),
			})),
		);
	});

	it("rejects unsigned GitHub App setup callback state before provider mutation", async () => {
		const initResponse = createResponse();
		await githubSetupHandler(
			createRequest({
				code: "manifest-code",
				state: "gh_init:org-2:user-2",
			}),
			initResponse,
		);

		const setupResponse = createResponse();
		await githubSetupHandler(
			createRequest({
				code: "setup-code",
				installation_id: "installation-1",
				state: "gh_setup:github-1",
			}),
			setupResponse,
		);

		expect(octokitMocks.request).not.toHaveBeenCalled();
		expect(providerMocks.createGithub).not.toHaveBeenCalled();
		expect(providerMocks.updateGithub).not.toHaveBeenCalled();
		expect(dbMocks.update).not.toHaveBeenCalled();
		expect(initResponse.statusCode).toBe(400);
		expect(setupResponse.statusCode).toBe(400);
	});

	it("rejects GitHub App setup callback state from a different Dokploy session", async () => {
		const state = signGitProviderOAuthState({
			providerType: "github-app",
			providerId: "gh_init",
			redirectUri: "https://dokploy.example.com/api/providers/github/setup",
			sessionId: "other-session",
			userId: oauthSession.userId,
			organizationId: oauthSession.activeOrganizationId,
		});

		const response = createResponse();
		await githubSetupHandler(
			createRequest({
				code: "manifest-code",
				state,
			}),
			response,
		);

		expect(octokitMocks.request).not.toHaveBeenCalled();
		expect(providerMocks.createGithub).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(400);
	});

	it("rejects tampered GitHub App setup callback state", async () => {
		const state = signGitProviderOAuthState({
			providerType: "github-app",
			providerId: "gh_setup:github-1",
			redirectUri: "https://dokploy.example.com/api/providers/github/setup",
			...sessionBinding,
		});
		const tamperedState = state.replace(/\.[^.]+$/, ".invalid-signature");

		const response = createResponse();
		await githubSetupHandler(
			createRequest({
				code: "setup-code",
				installation_id: "installation-1",
				state: tamperedState,
			}),
			response,
		);

		expect(providerMocks.findGithubById).not.toHaveBeenCalled();
		expect(providerMocks.updateGithub).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(400);
	});

	it("accepts valid signed GitHub App init and installation setup state", async () => {
		const initState = signGitProviderOAuthState({
			providerType: "github-app",
			providerId: "gh_init",
			redirectUri: "https://dokploy.example.com/api/providers/github/setup",
			...sessionBinding,
		});
		const setupState = signGitProviderOAuthState({
			providerType: "github-app",
			providerId: "gh_setup:github-1",
			redirectUri: "https://dokploy.example.com/api/providers/github/setup",
			...sessionBinding,
		});

		const initResponse = createResponse();
		await githubSetupHandler(
			createRequest({
				code: "manifest-code",
				state: initState,
			}),
			initResponse,
		);

		const setupResponse = createResponse();
		await githubSetupHandler(
			createRequest({
				code: "setup-code",
				installation_id: "installation-1",
				state: setupState,
			}),
			setupResponse,
		);

		expect(providerMocks.createGithub).toHaveBeenCalledWith(
			expect.objectContaining({
				githubAppName: "https://github.com/apps/dokploy-test",
				githubClientId: "github-client",
			}),
			"org-1",
			"user-1",
		);
		expect(providerMocks.updateGithub).toHaveBeenCalledWith("github-1", {
			githubInstallationId: "installation-1",
		});
		expect(initResponse.headers.location).toBe(
			"/dashboard/settings/git-providers",
		);
		expect(setupResponse.headers.location).toBe(
			"/dashboard/settings/git-providers",
		);
	});

	it("rejects unsigned Git provider OAuth callback state before token exchange", async () => {
		const gitlabResponse = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
			}),
			gitlabResponse,
		);

		const giteaResponse = createResponse();
		await giteaCallbackHandler(
			createRequest({
				code: "code-1",
				state: "gitea-1",
			}),
			giteaResponse,
		);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(providerMocks.updateGitlab).not.toHaveBeenCalled();
		expect(providerMocks.updateGitea).not.toHaveBeenCalled();
		expect(gitlabResponse.statusCode).toBe(400);
		expect(giteaResponse.headers.location).toContain("Invalid");
	});

	it("rejects tampered or mismatched Git provider OAuth callback state", async () => {
		const giteaStateForGitlab = signGitProviderOAuthState({
			providerType: "gitea",
			providerId: "gitea-1",
			redirectUri: giteaProvider.redirectUri,
			...sessionBinding,
		});
		const gitlabStateForOtherProvider = signGitProviderOAuthState({
			providerType: "gitlab",
			providerId: "gitlab-other",
			redirectUri: gitlabProvider.redirectUri,
			...sessionBinding,
		});

		const gitlabResponse = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
				state: gitlabStateForOtherProvider,
			}),
			gitlabResponse,
		);

		const giteaResponse = createResponse();
		await giteaCallbackHandler(
			createRequest({
				code: "code-1",
				state: giteaStateForGitlab.replace(/.$/, "x"),
			}),
			giteaResponse,
		);

		const crossKindResponse = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
				state: giteaStateForGitlab,
			}),
			crossKindResponse,
		);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(providerMocks.updateGitlab).not.toHaveBeenCalled();
		expect(providerMocks.updateGitea).not.toHaveBeenCalled();
		expect(gitlabResponse.statusCode).toBe(400);
		expect(giteaResponse.headers.location).toContain("Invalid");
		expect(crossKindResponse.statusCode).toBe(400);
	});

	it("rejects expired Git provider OAuth callback state", async () => {
		const expiredState = signGitProviderOAuthState({
			providerType: "gitlab",
			providerId: "gitlab-1",
			redirectUri: `${gitlabProvider.redirectUri}?gitlabId=gitlab-1`,
			...sessionBinding,
			now: Date.now() - 20 * 60 * 1000,
			ttlMs: 60 * 1000,
		});

		const response = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
				state: expiredState,
			}),
			response,
		);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(providerMocks.updateGitlab).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(400);
	});

	it("rejects Git provider OAuth callback state from a different Dokploy session", async () => {
		const otherSessionState = signGitProviderOAuthState({
			providerType: "gitlab",
			providerId: "gitlab-1",
			redirectUri: `${gitlabProvider.redirectUri}?gitlabId=gitlab-1`,
			sessionId: "other-session",
			userId: oauthSession.userId,
			organizationId: oauthSession.activeOrganizationId,
		});

		const response = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
				state: otherSessionState,
			}),
			response,
		);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(providerMocks.updateGitlab).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(400);
	});

	it("rejects Git provider OAuth authorization without an authenticated Dokploy session", async () => {
		authMocks.validateRequest.mockResolvedValueOnce({
			session: null,
			user: null,
		});

		const response = createResponse();
		await gitlabAuthorizeHandler(
			createRequest({
				gitlabId: "gitlab-1",
			}),
			response,
		);

		expect(providerMocks.findGitlabById).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(401);
	});

	it("rejects Git provider OAuth authorization outside the active organization", async () => {
		providerMocks.findGitlabById.mockResolvedValueOnce({
			...gitlabProvider,
			gitProvider: {
				...gitlabProvider.gitProvider,
				organizationId: "org-2",
			},
		});

		const response = createResponse();
		await gitlabAuthorizeHandler(
			createRequest({
				gitlabId: "gitlab-1",
			}),
			response,
		);

		expect(response.statusCode).toBe(403);
		expect(response.redirect).not.toHaveBeenCalled();
	});

	it("rejects Git provider OAuth callback for a non-manager session", async () => {
		authMocks.validateRequest.mockResolvedValueOnce({
			session: oauthSession,
			user: {
				...oauthUser,
				role: "member",
			},
		});
		providerMocks.findGitlabById.mockResolvedValueOnce({
			...gitlabProvider,
			gitProvider: {
				...gitlabProvider.gitProvider,
				userId: "other-user",
			},
		});
		const state = signGitProviderOAuthState({
			providerType: "gitlab",
			providerId: "gitlab-1",
			redirectUri: `${gitlabProvider.redirectUri}?gitlabId=gitlab-1`,
			...sessionBinding,
		});

		const response = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
				state,
			}),
			response,
		);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(providerMocks.updateGitlab).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(403);
	});

	it("accepts valid signed Git provider OAuth callback state", async () => {
		const gitlabState = signGitProviderOAuthState({
			providerType: "gitlab",
			providerId: "gitlab-1",
			redirectUri: `${gitlabProvider.redirectUri}?gitlabId=gitlab-1`,
			...sessionBinding,
		});
		const giteaState = signGitProviderOAuthState({
			providerType: "gitea",
			providerId: "gitea-1",
			redirectUri: giteaProvider.redirectUri,
			...sessionBinding,
		});

		const gitlabResponse = createResponse();
		await gitlabCallbackHandler(
			createRequest({
				code: "code-1",
				gitlabId: "gitlab-1",
				state: gitlabState,
			}),
			gitlabResponse,
		);

		const giteaResponse = createResponse();
		await giteaCallbackHandler(
			createRequest({
				code: "code-2",
				state: giteaState,
			}),
			giteaResponse,
		);

		expect(providerMocks.updateGitlab).toHaveBeenCalledWith(
			"gitlab-1",
			expect.objectContaining({
				accessToken: "access-token",
				refreshToken: "refresh-token",
			}),
		);
		expect(providerMocks.updateGitea).toHaveBeenCalledWith(
			"gitea-1",
			expect.objectContaining({
				accessToken: "access-token",
				refreshToken: "refresh-token",
			}),
		);
		expect(gitlabResponse.headers.location).toBe(
			"/dashboard/settings/git-providers",
		);
		expect(giteaResponse.headers.location).toBe(
			"/dashboard/settings/git-providers?connected=true",
		);
	});

	it("preserves Git provider OAuth connect state contract", async () => {
		const giteaResponse = createResponse();
		await giteaAuthorizeHandler(
			createRequest({
				giteaId: "gitea-1",
			}),
			giteaResponse,
		);

		expect(giteaResponse.headers.location).toBeDefined();
		const giteaRedirectLocation = new URL(giteaResponse.headers.location ?? "");
		const giteaState = giteaRedirectLocation.searchParams.get("state");
		expect(giteaState).toBeTruthy();
		expect(giteaRedirectLocation.origin).toBe("https://gitea.example.com");
		expect(giteaRedirectLocation.searchParams.get("scope")).toBe(
			"read:user read:repository read:organization",
		);
		expect(giteaRedirectLocation.searchParams.get("scope")).not.toContain(
			" repo",
		);
		expect(
			verifyGitProviderOAuthState(giteaState ?? "", {
				providerType: "gitea",
				providerId: "gitea-1",
				redirectUri: giteaProvider.redirectUri,
				...sessionBinding,
			}),
		).toMatchObject({
			providerType: "gitea",
			providerId: "gitea-1",
			sessionId: oauthSession.id,
			userId: oauthSession.userId,
			organizationId: oauthSession.activeOrganizationId,
		});

		const gitlabResponse = createResponse();
		await gitlabAuthorizeHandler(
			createRequest({
				gitlabId: "gitlab-1",
			}),
			gitlabResponse,
		);

		expect(gitlabResponse.headers.location).toBeDefined();
		const gitlabRedirectLocation = new URL(
			gitlabResponse.headers.location ?? "",
		);
		const gitlabState = gitlabRedirectLocation.searchParams.get("state");
		expect(gitlabState).toBeTruthy();
		expect(gitlabRedirectLocation.origin).toBe("https://gitlab.example.com");
		expect(gitlabRedirectLocation.searchParams.get("scope")).toBe(
			"api read_user read_repository",
		);
		expect(gitlabRedirectLocation.searchParams.has("scopes")).toBe(false);
		expect(
			verifyGitProviderOAuthState(gitlabState ?? "", {
				providerType: "gitlab",
				providerId: "gitlab-1",
				redirectUri: `${gitlabProvider.redirectUri}?gitlabId=gitlab-1`,
				...sessionBinding,
			}),
		).toMatchObject({
			providerType: "gitlab",
			providerId: "gitlab-1",
			sessionId: oauthSession.id,
			userId: oauthSession.userId,
			organizationId: oauthSession.activeOrganizationId,
		});
	});
});
