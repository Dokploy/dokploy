import { cloneBitbucketRepository } from "@dokploy/server/utils/providers/bitbucket";
import { cloneGiteaRepository } from "@dokploy/server/utils/providers/gitea";
import { cloneGitlabRepository } from "@dokploy/server/utils/providers/gitlab";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockFindBitbucketById,
	mockFindGiteaById,
	mockFindGitlabById,
	mockUpdateGitea,
	mockUpdateGitlab,
} = vi.hoisted(() => ({
	mockFindBitbucketById: vi.fn(),
	mockFindGiteaById: vi.fn(),
	mockFindGitlabById: vi.fn(),
	mockUpdateGitea: vi.fn(),
	mockUpdateGitlab: vi.fn(),
}));

vi.mock("@dokploy/server/services/bitbucket", () => ({
	findBitbucketById: mockFindBitbucketById,
}));

vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: mockFindGiteaById,
	updateGitea: mockUpdateGitea,
}));

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: mockFindGitlabById,
	updateGitlab: mockUpdateGitlab,
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockFindBitbucketById.mockResolvedValue({
		apiToken: "bitbucket-token",
	});
	mockFindGitlabById.mockResolvedValue({
		gitlabUrl: "https://gitlab.example.com",
		gitlabInternalUrl: "https://gitlab.internal/gitlab",
		accessToken: "gitlab-token",
		refreshToken: "gitlab-refresh-token",
		expiresAt: Math.floor(Date.now() / 1000) + 3600,
	});
	mockFindGiteaById.mockResolvedValue({
		giteaUrl: "https://gitea.example.com",
		giteaInternalUrl: "https://gitea.internal/gitea",
		accessToken: "gitea-token",
		refreshToken: "gitea-refresh-token",
		clientId: "gitea-client",
		clientSecret: "gitea-secret",
		expiresAt: Math.floor(Date.now() / 1000) + 3600,
	});
});

describe("OAuth Git provider submodule authentication", () => {
	it("authenticates Bitbucket SSH submodules with the provider token", async () => {
		const command = await cloneBitbucketRepository({
			appName: "bitbucket-app",
			bitbucketRepository: "private-repository",
			bitbucketOwner: "workspace",
			bitbucketBranch: "main",
			bitbucketId: "bitbucket-provider",
			enableSubmodules: true,
			serverId: null,
			outputPathOverride: "/tmp/bitbucket-app",
		});
		const authorization = Buffer.from(
			"x-bitbucket-api-token-auth:bitbucket-token",
		).toString("base64");

		expect(command).toContain(
			`http.https://bitbucket.org/.extraheader=Authorization: Basic ${authorization}`,
		);
		expect(command).toContain("submodule update --init --depth 1");
		expect(command).toContain(
			"url.https://bitbucket.org/.insteadOf=git@bitbucket.org:",
		);
		expect(command).not.toContain("bitbucket-token@");
	});

	it("authenticates Bitbucket clones with an app password", async () => {
		mockFindBitbucketById.mockResolvedValue({
			bitbucketUsername: "bitbucket-user",
			appPassword: "app-password",
		});
		const command = await cloneBitbucketRepository({
			appName: "bitbucket-app",
			bitbucketRepository: "private-repository",
			bitbucketOwner: "workspace",
			bitbucketBranch: "main",
			bitbucketId: "bitbucket-provider",
			enableSubmodules: true,
			serverId: null,
			outputPathOverride: "/tmp/bitbucket-app",
		});
		const authorization = Buffer.from("bitbucket-user:app-password").toString(
			"base64",
		);

		expect(command).toContain(
			`http.https://bitbucket.org/.extraheader=Authorization: Basic ${authorization}`,
		);
		expect(command).not.toContain("app-password@");
	});

	it("rewrites GitLab SSH URLs to the configured internal URL", async () => {
		const input = {
			appName: "gitlab-app",
			gitlabRepository: "private-repository",
			gitlabOwner: "team",
			gitlabBranch: "main",
			gitlabId: "gitlab-provider",
			gitlabPathNamespace: "team/private-repository",
			enableSubmodules: true,
			serverId: null,
			outputPathOverride: "/tmp/gitlab-app",
		};
		const command = await cloneGitlabRepository(input);
		const authorization = Buffer.from("oauth2:gitlab-token").toString("base64");

		expect(command).toContain(
			`http.https://gitlab.internal/gitlab/.extraheader=Authorization: Basic ${authorization}`,
		);
		expect(command).toContain(
			`http.https://gitlab.example.com/.extraheader=Authorization: Basic ${authorization}`,
		);
		expect(command).toContain("submodule update --init --depth 1");
		expect(command).toContain(
			"url.https://gitlab.internal/gitlab/.insteadOf=git@gitlab.example.com:",
		);
		expect(command).not.toContain("gitlab-token@");
	});

	it("normalizes schemeless GitLab clone URLs to HTTPS with matching auth", async () => {
		mockFindGitlabById.mockResolvedValue({
			gitlabUrl: "gitlab.example.com",
			gitlabInternalUrl: "gitlab.internal/gitlab",
			accessToken: "gitlab-token",
			refreshToken: "gitlab-refresh-token",
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		})
		const command = await cloneGitlabRepository({
			appName: "gitlab-app",
			gitlabRepository: "private-repository",
			gitlabOwner: "team",
			gitlabBranch: "main",
			gitlabId: "gitlab-provider",
			gitlabPathNamespace: "team/private-repository",
			enableSubmodules: false,
			serverId: null,
			outputPathOverride: "/tmp/gitlab-app",
		})
		const cloneCommand = command.replace(/\\/g, "")
		const authorization = Buffer.from("oauth2:gitlab-token").toString("base64")

		expect(cloneCommand).toContain(
			`http.https://gitlab.internal/gitlab/.extraheader=Authorization: Basic ${authorization}`,
		)
		expect(cloneCommand).toContain(
			"clone --branch main --depth 1 https://gitlab.internal/gitlab/team/private-repository.git",
		)
		expect(cloneCommand).not.toContain("http://gitlab.internal")
		expect(cloneCommand).not.toMatch(/https?:\/\/[^/\s'"]+@/)
	})

	it("rewrites Gitea SSH URLs to the configured internal URL", async () => {
		const command = await cloneGiteaRepository({
			appName: "gitea-app",
			giteaBranch: "main",
			giteaId: "gitea-provider",
			giteaOwner: "team",
			giteaRepository: "private-repository",
			enableSubmodules: true,
			serverId: null,
			outputPathOverride: "/tmp/gitea-app",
		});
		const authorization = Buffer.from("oauth2:gitea-token").toString("base64");

		expect(command).toContain(
			`http.https://gitea.internal/gitea/.extraheader=Authorization: Basic ${authorization}`,
		);
		expect(command).toContain(
			`http.https://gitea.example.com/.extraheader=Authorization: Basic ${authorization}`,
		);
		expect(command).toContain("submodule update --init --depth 1");
		expect(command).toContain(
			"url.https://gitea.internal/gitea/.insteadOf=git@gitea.example.com:",
		);
		expect(command).not.toContain("gitea-token@");
	});

	it("normalizes Gitea URLs without a scheme when submodules are disabled", async () => {
		mockFindGiteaById.mockResolvedValue({
			giteaUrl: "gitea.example.com",
			giteaInternalUrl: "gitea.internal/gitea",
			accessToken: "gitea-token",
			refreshToken: "gitea-refresh-token",
			clientId: "gitea-client",
			clientSecret: "gitea-secret",
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
		});
		const command = await cloneGiteaRepository({
			appName: "gitea-app",
			giteaBranch: "main",
			giteaId: "gitea-provider",
			giteaOwner: "team",
			giteaRepository: "private-repository",
			enableSubmodules: false,
			serverId: null,
			outputPathOverride: "/tmp/gitea-app",
		});
		const authorization = Buffer.from("oauth2:gitea-token").toString("base64");

		expect(command).toContain(
			`http.https://gitea.internal/gitea/.extraheader=Authorization: Basic ${authorization}`,
		);
	});
});
