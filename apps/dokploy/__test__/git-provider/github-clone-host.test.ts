import {
	cleanupSecretTempFiles,
	takeSecretTempFilesForCommand,
} from "@dokploy/server/utils/process/secrets";
import { beforeEach, describe, expect, it, vi } from "vitest";

// cloneGithubRepository builds a shell command; app authentication is stubbed so
// host selection and credential-safe command generation can be tested directly.
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
	cleanupSecretTempFiles(takeSecretTempFilesForCommand(command));
	return command.replace(/\\/g, "");
};

const expectCredentialSafeClone = (command: string, cloneUrl: string) => {
	expect(command).toContain(cloneUrl);
	expect(command).not.toContain("gh-token");
	expect(command).not.toContain("oauth2:");
	expect(command).toContain("GIT_ASKPASS=");
	expect(command).toContain("GIT_TERMINAL_PROMPT=0");
};

describe("cloneGithubRepository host", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("clones from github.com for a default provider", async () => {
		mockFindGithubById.mockResolvedValue(provider("https://github.com"));

		const command = await clone();

		expectCredentialSafeClone(command, "https://github.com/acme/web.git");
		expect(command).not.toContain("ghe.com");
	});

	it("clones from the Enterprise host, not github.com", async () => {
		mockFindGithubById.mockResolvedValue(provider("https://acme.ghe.com"));

		const command = await clone();

		expectCredentialSafeClone(command, "https://acme.ghe.com/acme/web.git");
		expect(command).not.toContain("github.com");
	});

	it("clones from a self-hosted Enterprise Server host", async () => {
		mockFindGithubById.mockResolvedValue(
			provider("https://github.corp.acme.com"),
		);

		const command = await clone();

		expectCredentialSafeClone(
			command,
			"https://github.corp.acme.com/acme/web.git",
		);
	});

	it("keeps an explicit port in the clone host", async () => {
		mockFindGithubById.mockResolvedValue(
			provider("https://github.acme.com:8443"),
		);

		const command = await clone();

		expectCredentialSafeClone(
			command,
			"https://github.acme.com:8443/acme/web.git",
		);
	});

	it("falls back to github.com for a provider stored before this feature", async () => {
		mockFindGithubById.mockResolvedValue(provider(""));

		const command = await clone();

		expectCredentialSafeClone(command, "https://github.com/acme/web.git");
	});
});
