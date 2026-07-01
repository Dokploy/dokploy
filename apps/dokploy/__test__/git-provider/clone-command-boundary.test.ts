import { parse } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
	branch: "main; touch /tmp/branch",
	outputPath: "/tmp/app code; touch /tmp/output",
	customGitUrl: "https://git.example.com/org/repo.git; touch /tmp/custom-url",
	customSshUrl: "git@git.example.com;touch/owner/repo.git",
	githubOwner: "owner; touch /tmp/github-owner",
	githubRepository: "repo$(id)",
	githubToken: "gh-token$(id); touch /tmp/github-token",
	gitlabBaseUrl: "https://gitlab.example.com/shell;touch",
	gitlabNamespace: "group/project$(id); touch /tmp/gitlab-namespace",
	gitlabToken: "gl-token$(id); touch /tmp/gitlab-token",
	bitbucketOwner: "workspace; touch /tmp/bitbucket-owner",
	bitbucketRepository: "repo$(id); touch /tmp/bitbucket-repo",
	bitbucketToken: "bb-token$(id); touch /tmp/bitbucket-token",
	giteaBaseUrl: "https://gitea.example.com/shell;touch",
	giteaOwner: "owner; touch /tmp/gitea-owner",
	giteaRepository: "repo$(id)",
	giteaToken: "gt-token$(id); touch /tmp/gitea-token",
}));

const mocks = vi.hoisted(() => ({
	findBitbucketById: vi.fn(),
	findGiteaById: vi.fn(),
	findGithubById: vi.fn(),
	findGitlabById: vi.fn(),
	findSSHKeyById: vi.fn(),
	fetchWithPublicEgress: vi.fn(),
	updateGitea: vi.fn(),
	updateGitlab: vi.fn(),
	updateSSHKeyById: vi.fn(),
}));

vi.mock("@octokit/auth-app", () => ({
	createAppAuth: vi.fn(),
}));

vi.mock("octokit", () => ({
	Octokit: class {
		auth = vi.fn().mockResolvedValue({ token: fixtures.githubToken });
	},
}));

vi.mock("@dokploy/server/services/bitbucket", () => ({
	findBitbucketById: mocks.findBitbucketById,
}));

vi.mock("@dokploy/server/services/gitea", () => ({
	findGiteaById: mocks.findGiteaById,
	updateGitea: mocks.updateGitea,
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: mocks.findGithubById,
}));

vi.mock("@dokploy/server/services/gitlab", () => ({
	findGitlabById: mocks.findGitlabById,
	updateGitlab: mocks.updateGitlab,
}));

vi.mock("@dokploy/server/services/ssh-key", () => ({
	findSSHKeyById: mocks.findSSHKeyById,
	updateSSHKeyById: mocks.updateSSHKeyById,
}));

vi.mock("@dokploy/server/utils/url/network", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/utils/url/network")>();

	return {
		...actual,
		fetchWithPublicEgress: mocks.fetchWithPublicEgress,
	};
});

const {
	cloneBitbucketRepository,
	getBitbucketBranches,
	testBitbucketConnection,
} = await import("@dokploy/server/utils/providers/bitbucket");
const { assertCustomGitUrlAllowed, cloneGitRepository } = await import(
	"@dokploy/server/utils/providers/git"
);
const { assertGiteaRepositoryScope, cloneGiteaRepository, getGiteaBranches } =
	await import("@dokploy/server/utils/providers/gitea");
const { cloneGithubRepository } = await import(
	"@dokploy/server/utils/providers/github"
);
const {
	assertGitlabProjectScope,
	cloneGitlabRepository,
	getGitlabBranches,
	getGitlabRepositories,
	testGitlabConnection,
} = await import("@dokploy/server/utils/providers/gitlab");

const parseShellArgs = (command: string) =>
	parse(command).filter((part): part is string => typeof part === "string");

const extractGitCloneArgs = (command: string) => {
	for (const line of command.split("\n")) {
		const args = parseShellArgs(line);
		const gitStart = args.indexOf("git");
		const cloneIndex = args.indexOf("clone");
		if (gitStart >= 0 && cloneIndex > gitStart) {
			return [args[gitStart], ...args.slice(cloneIndex)];
		}
	}

	throw new Error("git clone command not found");
};

const expectCloneArgsPreserveDangerousValues = (
	command: string,
	expected: {
		branch: string;
		cloneUrl: string;
		outputPath: string;
	},
) => {
	const args = extractGitCloneArgs(command);

	expect(args.slice(0, 2)).toEqual(["git", "clone"]);
	expect(args[args.indexOf("--branch") + 1]).toBe(expected.branch);
	expect(args).toContain("--depth");
	expect(args).toContain("1");
	expect(args).toContain("--progress");
	expect(args).toContain(expected.cloneUrl);
	expect(args).toContain(expected.outputPath);
	expect(command).not.toContain(`--branch ${expected.branch}`);
	expect(command).not.toContain(`${expected.cloneUrl} ${expected.outputPath}`);
	expect(command).not.toContain('echo "Cloning Repo');
};

describe("Git provider clone command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.findGithubById.mockResolvedValue({
			githubAppId: 1,
			githubInstallationId: 1,
			githubPrivateKey: "private-key",
		});
		mocks.findGitlabById.mockResolvedValue({
			accessToken: fixtures.gitlabToken,
			expiresAt: 4_102_444_800,
			groupName: null,
			gitlabInternalUrl: null,
			gitlabUrl: fixtures.gitlabBaseUrl,
			refreshToken: "refresh-token",
		});
		mocks.findBitbucketById.mockResolvedValue({
			apiToken: fixtures.bitbucketToken,
			bitbucketEmail: "user@example.com",
			bitbucketUsername: fixtures.bitbucketOwner,
			bitbucketWorkspaceName: fixtures.bitbucketOwner,
		});
		mocks.findGiteaById.mockResolvedValue({
			accessToken: fixtures.giteaToken,
			giteaInternalUrl: null,
			giteaUrl: fixtures.giteaBaseUrl,
			organizationName: null,
		});
		mocks.findSSHKeyById.mockResolvedValue({
			privateKey: "private-key$(id); touch /tmp/private-key",
		});
		mocks.updateGitea.mockResolvedValue(undefined);
		mocks.updateGitlab.mockResolvedValue(undefined);
		mocks.updateSSHKeyById.mockResolvedValue(undefined);
		mocks.fetchWithPublicEgress.mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						commit: {
							id: "commit-1",
						},
						id: "branch-1",
						name: "main",
					},
				]),
				{
					headers: {
						"x-total": "1",
					},
					status: 200,
				},
			),
		);
	});

	it("quotes custom Git clone arguments and log messages", async () => {
		const command = await cloneGitRepository({
			appName: "app",
			customGitBranch: fixtures.branch,
			customGitSSHKeyId: null,
			customGitUrl: fixtures.customGitUrl,
			enableSubmodules: false,
			outputPathOverride: fixtures.outputPath,
			serverId: null,
		});

		expectCloneArgsPreserveDangerousValues(command, {
			branch: fixtures.branch,
			cloneUrl: fixtures.customGitUrl,
			outputPath: fixtures.outputPath,
		});
		expect(command).not.toContain(
			`echo "Cloning Repo Custom ${fixtures.customGitUrl}`,
		);
	});

	it("quotes custom SSH known-hosts and private-key command boundaries", async () => {
		const command = await cloneGitRepository({
			appName: "app",
			customGitBranch: fixtures.branch,
			customGitSSHKeyId: "ssh-key-1",
			customGitUrl: fixtures.customSshUrl,
			enableSubmodules: true,
			outputPathOverride: fixtures.outputPath,
			serverId: "server-1",
		});

		expectCloneArgsPreserveDangerousValues(command, {
			branch: fixtures.branch,
			cloneUrl: fixtures.customSshUrl,
			outputPath: fixtures.outputPath,
		});
		expect(parseShellArgs(command)).toContain("git.example.com;touch");
		expect(command).toContain("StrictHostKeyChecking\\=accept-new");
		expect(command).not.toContain(
			'echo "private-key$(id); touch /tmp/private-key"',
		);
		expect(command).not.toContain("ssh-keyscan -p 22 git.example.com;touch");
	});

	it("rejects custom HTTPS Git URLs that resolve to private cloud addresses", async () => {
		await expect(
			assertCustomGitUrlAllowed("https://git.example.com/org/repo.git", {
				enforcePublicHost: true,
				lookup: async () => [{ address: "192.168.1.10", family: 4 }],
			}),
		).rejects.toThrow("Custom Git URL");
	});

	it("rejects custom SSH Git URLs that resolve to private cloud addresses", async () => {
		await expect(
			assertCustomGitUrlAllowed("git@git.example.com:org/repo.git", {
				enforcePublicHost: true,
				lookup: async () => [{ address: "10.0.0.10", family: 4 }],
			}),
		).rejects.toThrow("Custom Git URL");
	});

	it("allows custom Git URLs that resolve to public cloud addresses", async () => {
		await expect(
			assertCustomGitUrlAllowed("https://git.example.com/org/repo.git", {
				enforcePublicHost: true,
				lookup: async () => [{ address: "93.184.216.34", family: 4 }],
			}),
		).resolves.toBeUndefined();
	});

	it("quotes GitHub clone metadata", async () => {
		const expectedCloneUrl = `https://oauth2:${fixtures.githubToken}@github.com/${fixtures.githubOwner}/${fixtures.githubRepository}.git`;
		const command = await cloneGithubRepository({
			appName: "app",
			branch: fixtures.branch,
			enableSubmodules: true,
			githubId: "github-1",
			outputPathOverride: fixtures.outputPath,
			owner: fixtures.githubOwner,
			repository: fixtures.githubRepository,
			serverId: null,
		});

		expectCloneArgsPreserveDangerousValues(command, {
			branch: fixtures.branch,
			cloneUrl: expectedCloneUrl,
			outputPath: fixtures.outputPath,
		});
	});

	it("quotes GitLab clone metadata", async () => {
		const repoClone = `${fixtures.gitlabBaseUrl.replace(/^https?:\/\//, "")}/${fixtures.gitlabNamespace}.git`;
		const expectedCloneUrl = `https://oauth2:${fixtures.gitlabToken}@${repoClone}`;
		const command = await cloneGitlabRepository({
			appName: "app",
			enableSubmodules: false,
			gitlabBranch: fixtures.branch,
			gitlabId: "gitlab-1",
			gitlabOwner: "group",
			gitlabPathNamespace: fixtures.gitlabNamespace,
			gitlabRepository: "project",
			outputPathOverride: fixtures.outputPath,
			serverId: null,
		} as never);

		expectCloneArgsPreserveDangerousValues(command, {
			branch: fixtures.branch,
			cloneUrl: expectedCloneUrl,
			outputPath: fixtures.outputPath,
		});
	});

	it("quotes Bitbucket clone metadata", async () => {
		const repoClone = `bitbucket.org/${fixtures.bitbucketOwner}/${fixtures.bitbucketRepository}.git`;
		const expectedCloneUrl = `https://x-bitbucket-api-token-auth:${fixtures.bitbucketToken}@${repoClone}`;
		const command = await cloneBitbucketRepository({
			appName: "app",
			bitbucketBranch: fixtures.branch,
			bitbucketId: "bitbucket-1",
			bitbucketOwner: fixtures.bitbucketOwner,
			bitbucketRepository: fixtures.bitbucketRepository,
			enableSubmodules: false,
			outputPathOverride: fixtures.outputPath,
			serverId: null,
		});

		expectCloneArgsPreserveDangerousValues(command, {
			branch: fixtures.branch,
			cloneUrl: expectedCloneUrl,
			outputPath: fixtures.outputPath,
		});
	});

	it("rejects Bitbucket clone metadata outside the configured workspace", async () => {
		await expect(
			cloneBitbucketRepository({
				appName: "app",
				bitbucketBranch: "main",
				bitbucketId: "bitbucket-1",
				bitbucketOwner: "outside-workspace",
				bitbucketRepository: "repo",
				enableSubmodules: false,
				outputPathOverride: fixtures.outputPath,
				serverId: null,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects Bitbucket branch lookup outside the configured workspace before fetching", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");

		await expect(
			getBitbucketBranches({
				bitbucketId: "bitbucket-1",
				owner: "outside-workspace",
				repo: "repo",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects Bitbucket connection checks outside the configured workspace", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");

		await expect(
			testBitbucketConnection({
				bitbucketId: "bitbucket-1",
				workspaceName: "outside-workspace",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects GitLab clone metadata outside the configured group", async () => {
		mocks.findGitlabById.mockResolvedValue({
			accessToken: fixtures.gitlabToken,
			expiresAt: 4_102_444_800,
			groupName: "allowed/group",
			gitlabInternalUrl: null,
			gitlabUrl: fixtures.gitlabBaseUrl,
			refreshToken: "refresh-token",
		});

		await expect(
			cloneGitlabRepository({
				appName: "app",
				enableSubmodules: false,
				gitlabBranch: "main",
				gitlabId: "gitlab-1",
				gitlabPathNamespace: "outside/group/repo",
				outputPathOverride: fixtures.outputPath,
				serverId: null,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects GitLab branch lookup outside the configured group before fetching", async () => {
		mocks.findGitlabById.mockResolvedValue({
			accessToken: fixtures.gitlabToken,
			expiresAt: 4_102_444_800,
			groupName: "allowed/group",
			gitlabInternalUrl: null,
			gitlabUrl: fixtures.gitlabBaseUrl,
			refreshToken: "refresh-token",
		});

		await expect(
			getGitlabBranches({
				gitlabId: "gitlab-1",
				id: 1,
				gitlabPathNamespace: "outside/group/repo",
				owner: "outside",
				repo: "repo",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("uses the scoped GitLab namespace instead of trusting a mismatched project id for branch lookup", async () => {
		mocks.findGitlabById.mockResolvedValue({
			accessToken: fixtures.gitlabToken,
			expiresAt: 4_102_444_800,
			groupName: "allowed/group",
			gitlabInternalUrl: null,
			gitlabUrl: fixtures.gitlabBaseUrl,
			refreshToken: "refresh-token",
		});

		await expect(
			getGitlabBranches({
				gitlabId: "gitlab-1",
				id: 999,
				gitlabPathNamespace: "allowed/group/repo",
				owner: "allowed",
				repo: "repo",
			}),
		).resolves.toEqual([
			{
				commit: {
					id: "commit-1",
				},
				id: "branch-1",
				name: "main",
			},
		]);

		const [url] = mocks.fetchWithPublicEgress.mock.calls[0] ?? [];
		expect(String(url)).toContain("projects/allowed%2Fgroup%2Frepo/");
		expect(String(url)).not.toContain("projects/999/");
	});

	it("allows nested GitLab project scope when the full namespace matches a configured group", () => {
		expect(() =>
			assertGitlabProjectScope(
				{ groupName: "allowed/group" },
				{ pathNamespace: "allowed/group/repo" },
			),
		).not.toThrow();
	});

	it("filters GitLab repository listing by configured group boundaries", async () => {
		mocks.findGitlabById.mockResolvedValue({
			accessToken: fixtures.gitlabToken,
			expiresAt: 4_102_444_800,
			groupName: "foo",
			gitlabInternalUrl: null,
			gitlabUrl: fixtures.gitlabBaseUrl,
			refreshToken: "refresh-token",
		});
		mocks.fetchWithPublicEgress.mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						id: 1,
						name: "allowed-root",
						namespace: { full_path: "foo", kind: "group", path: "foo" },
						path_with_namespace: "foo/allowed-root",
					},
					{
						id: 2,
						name: "allowed-child",
						namespace: {
							full_path: "foo/subgroup",
							kind: "group",
							path: "subgroup",
						},
						path_with_namespace: "foo/subgroup/allowed-child",
					},
					{
						id: 3,
						name: "prefix-collision",
						namespace: {
							full_path: "foobar",
							kind: "group",
							path: "foobar",
						},
						path_with_namespace: "foobar/prefix-collision",
					},
				]),
				{
					headers: {
						"x-total": "3",
					},
					status: 200,
				},
			),
		);

		await expect(getGitlabRepositories("gitlab-1")).resolves.toEqual([
			{
				id: 1,
				name: "allowed-root",
				owner: { username: "foo" },
				url: "foo/allowed-root",
			},
			{
				id: 2,
				name: "allowed-child",
				owner: { username: "subgroup" },
				url: "foo/subgroup/allowed-child",
			},
		]);
	});

	it("counts GitLab connection repositories by group boundaries", async () => {
		mocks.fetchWithPublicEgress.mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						id: 1,
						name: "allowed-root",
						namespace: { full_path: "foo", kind: "group", path: "foo" },
						path_with_namespace: "foo/allowed-root",
					},
					{
						id: 2,
						name: "allowed-child",
						namespace: {
							full_path: "foo/subgroup",
							kind: "group",
							path: "subgroup",
						},
						path_with_namespace: "foo/subgroup/allowed-child",
					},
					{
						id: 3,
						name: "prefix-collision",
						namespace: {
							full_path: "foobar",
							kind: "group",
							path: "foobar",
						},
						path_with_namespace: "foobar/prefix-collision",
					},
				]),
				{
					headers: {
						"x-total": "3",
					},
					status: 200,
				},
			),
		);

		await expect(
			testGitlabConnection({
				gitlabId: "gitlab-1",
				groupName: "foo",
			}),
		).resolves.toBe(2);
	});

	it("quotes Gitea clone metadata", async () => {
		const baseUrl = fixtures.giteaBaseUrl.replace(/^https?:\/\//, "");
		const expectedCloneUrl = `https://oauth2:${fixtures.giteaToken}@${baseUrl}/${fixtures.giteaOwner}/${fixtures.giteaRepository}.git`;
		const command = await cloneGiteaRepository({
			appName: "app",
			enableSubmodules: false,
			giteaBranch: fixtures.branch,
			giteaId: "gitea-1",
			giteaOwner: fixtures.giteaOwner,
			giteaRepository: fixtures.giteaRepository,
			outputPathOverride: fixtures.outputPath,
			serverId: null,
		});

		expectCloneArgsPreserveDangerousValues(command, {
			branch: fixtures.branch,
			cloneUrl: expectedCloneUrl,
			outputPath: fixtures.outputPath,
		});
	});

	it("rejects Gitea clone metadata outside the configured organization", async () => {
		mocks.findGiteaById.mockResolvedValue({
			accessToken: fixtures.giteaToken,
			giteaInternalUrl: null,
			giteaUrl: fixtures.giteaBaseUrl,
			organizationName: "allowed-org",
		});

		await expect(
			cloneGiteaRepository({
				appName: "app",
				enableSubmodules: false,
				giteaBranch: fixtures.branch,
				giteaId: "gitea-1",
				giteaOwner: "other-org",
				giteaRepository: fixtures.giteaRepository,
				outputPathOverride: fixtures.outputPath,
				serverId: null,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects Gitea branch lookup outside the configured organization before fetching", async () => {
		mocks.findGiteaById.mockResolvedValue({
			accessToken: fixtures.giteaToken,
			giteaInternalUrl: null,
			giteaUrl: fixtures.giteaBaseUrl,
			organizationName: "allowed-org",
		});

		await expect(
			getGiteaBranches({
				giteaId: "gitea-1",
				owner: "other-org",
				repo: "repo",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.fetchWithPublicEgress).not.toHaveBeenCalled();
	});

	it("allows Gitea repository scope when the owner matches a configured organization", () => {
		expect(() =>
			assertGiteaRepositoryScope(
				{ organizationName: "allowed-org" },
				"ALLOWED-ORG",
			),
		).not.toThrow();
	});
});
