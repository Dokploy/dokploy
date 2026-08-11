import { existsSync, statSync } from "node:fs";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import {
	cleanupSecretTempFiles,
	createGitAskPassScript,
	createSecretTempFile,
	rewriteSecretTempFilesForRemote,
	type SecretTempFile,
	takeSecretTempFilesForCommand,
} from "@dokploy/server/utils/process/secrets";
import { afterEach, describe, expect, it } from "vitest";

const leftovers: SecretTempFile[] = [];

afterEach(() => {
	cleanupSecretTempFiles(leftovers.splice(0));
});

describe("secret temp files", () => {
	it("rewrites controller paths to isolated remote paths without exposing values", () => {
		const marker = "registry-password-sentinel";
		const secret = createSecretTempFile("dokploy-test-", "password", marker);
		leftovers.push(secret);
		const command = `docker login --password-stdin < ${secret.quotedPath}; rm -rf ${secret.quotedDir}`;
		const files = takeSecretTempFilesForCommand(command);

		const rewritten = rewriteSecretTempFilesForRemote(
			command,
			files,
			"/tmp/dokploy-secrets-test",
		);

		expect(rewritten.command).not.toContain(marker);
		expect(rewritten.command).not.toContain(secret.path);
		expect(rewritten.command).toContain("/tmp/dokploy-secrets-test/0/password");
		expect(rewritten.files[0]).toMatchObject({
			localPath: secret.path,
			remoteDir: "/tmp/dokploy-secrets-test/0",
			remotePath: "/tmp/dokploy-secrets-test/0/password",
			mode: 0o600,
		});
	});

	it("creates askpass scripts with executable owner-only permissions", () => {
		const secret = createGitAskPassScript("provider-token-sentinel");
		leftovers.push(secret);

		expect(statSync(secret.dir).mode & 0o777).toBe(0o700);
		expect(statSync(secret.path).mode & 0o777).toBe(0o700);
	});

	it("cleans local secret files after successful execution", async () => {
		const secret = createSecretTempFile(
			"dokploy-test-",
			"password",
			"success-sentinel",
		);
		const dir = secret.dir;

		await execAsync(`test -s ${secret.quotedPath}`);

		expect(existsSync(dir)).toBe(false);
	});

	it("cleans local secret files after failed execution", async () => {
		const secret = createSecretTempFile(
			"dokploy-test-",
			"password",
			"failure-sentinel",
		);
		const dir = secret.dir;

		await expect(execAsync(`test ! -s ${secret.quotedPath}`)).rejects.toThrow();

		expect(existsSync(dir)).toBe(false);
	});
});
