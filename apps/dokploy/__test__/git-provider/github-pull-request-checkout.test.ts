import { beforeEach, describe, expect, it, vi } from "vitest";

// cloneGithubRepository builds a shell command; the only thing under test here
// is how a preview deployment checks out its pull request, so the app auth is
// stubbed out.
const mockFindGithubById = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: mockFindGithubById,
}));

vi.mock("@octokit/auth-app", () => ({
	createAppAuth: vi.fn(),
}));

vi.mock("octokit", () => ({
	Octokit: class {
		auth = async () => ({ token: "gh-token" });
	},
}));

const { cloneGithubRepository } = await import(
	"@dokploy/server/utils/providers/github"
);

const cloneUrl = "https://oauth2:gh-token@github.com/acme/web.git";

const clone = async (
	overrides: Partial<Parameters<typeof cloneGithubRepository>[0]> = {},
) => {
	const command = await cloneGithubRepository({
		appName: "preview-app",
		owner: "acme",
		repository: "web",
		branch: "feature/from-fork",
		githubId: "gh-1",
		enableSubmodules: false,
		serverId: null,
		...overrides,
	});
	return command.replace(/\\/g, "");
};

describe("cloneGithubRepository pull request checkout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFindGithubById.mockResolvedValue({
			githubId: "gh-1",
			githubUrl: "https://github.com",
			githubAppId: 1,
			githubPrivateKey: "key",
			githubInstallationId: "42",
		});
	});

	it("clones the branch when no pull request is given", async () => {
		const command = await clone();

		expect(command).toContain(
			`git clone --branch feature/from-fork --depth 1  ${cloneUrl}`,
		);
		expect(command).not.toContain("pull/");
	});

	it("fetches pull/<n>/head from the base repository for a pull request", async () => {
		const command = await clone({ pullRequestNumber: "6057" });

		expect(command).toContain(`remote add origin ${cloneUrl};`);
		expect(command).toContain(
			"fetch --depth 1 origin pull/6057/head --progress;",
		);
		expect(command).toContain("checkout -q FETCH_HEAD;");
		// The branch name is not cloned: for a fork pull request it does not
		// exist on the base repository.
		expect(command).not.toContain("git clone");
		expect(command).not.toContain("feature/from-fork");
	});

	it("initialises submodules after the pull request checkout", async () => {
		const command = await clone({
			pullRequestNumber: "6057",
			enableSubmodules: true,
		});

		expect(command).toContain("checkout -q FETCH_HEAD;");
		expect(command).toContain("submodule update --init --recursive --depth 1;");
	});

	it("only ever puts a number into the pull request ref", async () => {
		const command = await clone({
			pullRequestNumber: "6057; touch /tmp/pwned",
		});

		expect(command).toContain("pull/6057/head");
		expect(command).not.toContain("touch /tmp/pwned");
	});
});
