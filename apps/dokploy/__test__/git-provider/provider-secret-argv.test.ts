import {
	cleanupSecretTempFiles,
	takeSecretTempFilesForCommand,
} from "@dokploy/server/utils/process/secrets";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findSSHKeyById: vi.fn(),
	updateSSHKeyById: vi.fn(),
}));

vi.mock("@dokploy/server/services/ssh-key", () => ({
	findSSHKeyById: mocks.findSSHKeyById,
	updateSSHKeyById: mocks.updateSSHKeyById,
}));

import { getBitbucketCloneUrl } from "@dokploy/server/utils/providers/bitbucket";
import { cloneGitRepository } from "@dokploy/server/utils/providers/git";

describe("provider credentials in generated commands", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findSSHKeyById.mockResolvedValue({
			privateKey: "private-key-sentinel",
		});
		mocks.updateSSHKeyById.mockResolvedValue(undefined);
	});

	it("keeps Bitbucket API tokens and app passwords out of clone URLs", () => {
		expect(
			getBitbucketCloneUrl(
				{ apiToken: "api-token-sentinel" },
				"bitbucket.org/team/repo.git",
			),
		).toBe("https://bitbucket.org/team/repo.git");
		expect(
			getBitbucketCloneUrl(
				{
					bitbucketUsername: "user",
					appPassword: "app-password-sentinel",
				},
				"bitbucket.org/team/repo.git",
			),
		).toBe("https://bitbucket.org/team/repo.git");
	});

	it("stages custom Git SSH keys instead of embedding them in shell commands", async () => {
		const command = await cloneGitRepository({
			appName: "app",
			customGitUrl: "git@example.com:team/repo.git",
			customGitBranch: "main",
			customGitSSHKeyId: "key-1",
			enableSubmodules: false,
			serverId: "server-1",
		});
		const secretFiles = takeSecretTempFilesForCommand(command);
		try {
			expect(command).not.toContain("private-key-sentinel");
			expect(command).not.toContain("/tmp/id_rsa");
			expect(command).toContain("GIT_SSH_COMMAND=");
			expect(secretFiles).toHaveLength(1);
			expect(secretFiles[0]?.mode).toBe(0o600);
		} finally {
			cleanupSecretTempFiles(secretFiles);
		}
	});
});
