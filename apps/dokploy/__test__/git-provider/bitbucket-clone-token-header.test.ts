import { cloneBitbucketRepository } from "@dokploy/server/utils/providers/bitbucket";
import { cloneGitRepository } from "@dokploy/server/utils/providers/git";
import { quote } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

const { findBitbucketById } = vi.hoisted(() => ({
	findBitbucketById: vi.fn(),
}));

vi.mock("@dokploy/server/services/bitbucket", () => ({
	findBitbucketById,
}));

vi.mock("@dokploy/server/services/ssh-key", () => ({
	findSSHKeyById: vi.fn(async () => ({ privateKey: "PRIVATE KEY" })),
	updateSSHKeyById: vi.fn(),
}));

const basic = (user: string, secret: string) =>
	Buffer.from(`${user}:${secret}`).toString("base64");

const build = () =>
	cloneBitbucketRepository({
		appName: "my-app",
		bitbucketRepository: "web",
		bitbucketOwner: "acme",
		bitbucketBranch: "main",
		bitbucketId: "bb-1",
		enableSubmodules: false,
		serverId: null,
	});

describe("bitbucket clone keeps credentials out of the URL", () => {
	it("sends an API token as a host-scoped header", async () => {
		findBitbucketById.mockResolvedValueOnce({ apiToken: "bb-token" });
		const command = (await build()).replace(/\\/g, "");

		expect(command).not.toContain("bb-token");
		expect(command).toContain(
			`http.https://bitbucket.org/.extraHeader=Authorization: Basic ${basic("x-bitbucket-api-token-auth", "bb-token")}`,
		);
		expect(command).toContain(" https://bitbucket.org/acme/web.git ");
	});

	it("sends an app password as a host-scoped header", async () => {
		findBitbucketById.mockResolvedValueOnce({
			bitbucketUsername: "alice",
			appPassword: "app-pass",
		});
		const command = (await build()).replace(/\\/g, "");

		expect(command).not.toContain("app-pass");
		expect(command).toContain(
			`Authorization: Basic ${basic("alice", "app-pass")}`,
		);
		expect(command).toContain(" https://bitbucket.org/acme/web.git ");
	});
});

describe("custom git clone", () => {
	it("ends option parsing before the repository URL", async () => {
		// A URL starting with "-" is not HTTP(S), so it only reaches the clone with an SSH key.
		const customGitUrl = "--upload-pack=touch:/tmp/pwned";
		const command = await cloneGitRepository({
			appName: "demo-app",
			customGitUrl,
			customGitBranch: "main",
			customGitSSHKeyId: "key-1",
			enableSubmodules: false,
			serverId: null,
		});

		expect(command).toContain(`--progress -- ${quote([customGitUrl])} `);
	});
});
