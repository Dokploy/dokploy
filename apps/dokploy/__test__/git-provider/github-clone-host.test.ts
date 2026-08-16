import { beforeEach, describe, expect, it, vi } from "vitest";

// cloneGithubRepository builds a shell command; the only thing under test here
// is which host ends up in the clone URL, so the app auth is stubbed out.
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

const provider = (githubUrl: string) => ({
	githubId: "gh-1",
	githubUrl,
	githubAppId: 1,
	githubPrivateKey: "key",
	githubInstallationId: "42",
});

const clone = async () => {
	const command = await cloneGithubRepository({
		appName: "my-app",
		owner: "acme",
		repository: "web",
		branch: "main",
		githubId: "gh-1",
		enableSubmodules: false,
		serverId: null,
	});
	return command.replace(/\\/g, "");
};

describe("cloneGithubRepository host", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("clones from github.com for a default provider", async () => {
		mockFindGithubById.mockResolvedValue(provider("https://github.com"));

		const command = await clone();

		expect(command).toContain(
			"https://oauth2:gh-token@github.com/acme/web.git",
		);
		expect(command).not.toContain("ghe.com");
	});

	it("clones from the Enterprise host, not github.com", async () => {
		mockFindGithubById.mockResolvedValue(provider("https://acme.ghe.com"));

		const command = await clone();

		expect(command).toContain(
			"https://oauth2:gh-token@acme.ghe.com/acme/web.git",
		);
		expect(command).not.toContain("github.com");
	});

	it("clones from a self-hosted Enterprise Server host", async () => {
		mockFindGithubById.mockResolvedValue(
			provider("https://github.corp.acme.com"),
		);

		const command = await clone();

		expect(command).toContain(
			"https://oauth2:gh-token@github.corp.acme.com/acme/web.git",
		);
	});

	it("keeps an explicit port in the clone host", async () => {
		mockFindGithubById.mockResolvedValue(
			provider("https://github.acme.com:8443"),
		);

		const command = await clone();

		expect(command).toContain(
			"https://oauth2:gh-token@github.acme.com:8443/acme/web.git",
		);
	});

	it("falls back to github.com for a provider stored before this feature", async () => {
		mockFindGithubById.mockResolvedValue(provider(""));

		const command = await clone();

		expect(command).toContain(
			"https://oauth2:gh-token@github.com/acme/web.git",
		);
	});
});
