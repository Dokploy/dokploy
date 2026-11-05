import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn(async () => ({
		githubId: "gh-1",
		githubUrl: "https://github.com",
		githubAppId: 1,
		githubPrivateKey: "key",
		githubInstallationId: "42",
	})),
}));

vi.mock("@octokit/auth-app", () => ({
	createAppAuth: vi.fn(),
}));

vi.mock("octokit", () => ({
	Octokit: class {
		auth = async () => ({ token: "gh-token" });
	},
}));

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: vi.fn(async () => ({
		gitlabId: "gl-1",
		gitlabUrl: "https://gitlab.example.com",
		gitlabInternalUrl: null,
		accessToken: "gl-token",
		expiresAt: Math.floor(Date.now() / 1000) + 3600,
	})),
	updateGitlab: vi.fn(),
}));

vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: vi.fn(async () => ({
		giteaId: "gt-1",
		giteaUrl: "https://gitea.example.com:3000",
		giteaInternalUrl: null,
		accessToken: "gt-token",
	})),
	updateGitea: vi.fn(),
}));

const { cloneGithubRepository } = await import(
	"@dokploy/server/utils/providers/github"
);
const { cloneGitlabRepository } = await import(
	"@dokploy/server/utils/providers/gitlab"
);
const { cloneGiteaRepository } = await import(
	"@dokploy/server/utils/providers/gitea"
);

const basic = (token: string) =>
	Buffer.from(`oauth2:${token}`).toString("base64");

const base = { appName: "my-app", enableSubmodules: true, serverId: null };

describe("clone commands keep the token out of the URL (#5618)", () => {
	it.each([
		{
			provider: "github",
			token: "gh-token",
			origin: "https://github.com",
			url: "https://github.com/acme/web.git",
			build: () =>
				cloneGithubRepository({
					...base,
					owner: "acme",
					repository: "web",
					branch: "main",
					githubId: "gh-1",
				}),
		},
		{
			provider: "gitlab",
			token: "gl-token",
			origin: "https://gitlab.example.com",
			url: "https://gitlab.example.com/acme/web.git",
			build: () =>
				cloneGitlabRepository({
					...base,
					gitlabBranch: "main",
					gitlabId: "gl-1",
					gitlabPathNamespace: "acme/web",
					gitlabOwner: "acme",
					gitlabRepository: "web",
				} as Parameters<typeof cloneGitlabRepository>[0]),
		},
		{
			provider: "gitea",
			token: "gt-token",
			origin: "https://gitea.example.com:3000",
			url: "https://gitea.example.com:3000/acme/web.git",
			build: () =>
				cloneGiteaRepository({
					...base,
					giteaBranch: "main",
					giteaId: "gt-1",
					giteaOwner: "acme",
					giteaRepository: "web",
				}),
		},
	])(
		"$provider sends the token as a host-scoped header",
		async ({ token, origin, url, build }) => {
			const command = (await build()).replace(/\\/g, "");

			expect(command).not.toContain(`${token}@`);
			expect(command).toContain(
				`http.${origin}/.extraHeader=Authorization: Basic ${basic(token)}`,
			);
			expect(command).toContain(`--recurse-submodules ${url} `);
		},
	);
});
