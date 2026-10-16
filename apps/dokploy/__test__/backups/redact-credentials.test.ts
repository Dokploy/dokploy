import type { Destination } from "@dokploy/server/services/destination";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import {
	getFtpCredentials,
	getS3Credentials,
	getSftpCredentials,
	getWebdavCredentials,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, it } from "vitest";

describe("redactRcloneCredentials (#4621)", () => {
	it("should redact access key in rclone command", () => {
		const cmd =
			'rclone rcat --s3-access-key-id="AKIAIOSFODNN7EXAMPLE" --s3-secret-access-key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" :s3:bucket/file.gz';
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
		expect(redacted).toContain('--s3-access-key-id="[REDACTED]"');
	});

	it("should redact secret access key in rclone command", () => {
		const cmd =
			'rclone rcat --s3-access-key-id="key" --s3-secret-access-key="supersecret" :s3:bucket/file.gz';
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("supersecret");
		expect(redacted).toContain('--s3-secret-access-key="[REDACTED]"');
	});

	it("should redact both credentials simultaneously", () => {
		const cmd =
			'rclone lsf --s3-access-key-id="AKIA123" --s3-secret-access-key="secret456" --s3-region="us-east-1" :s3:bucket/';
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("AKIA123");
		expect(redacted).not.toContain("secret456");
		expect(redacted).toContain('--s3-region="us-east-1"');
	});

	it("should not modify non-credential flags", () => {
		const cmd =
			'rclone rcat --s3-region="eu-west-1" --s3-endpoint="https://s3.example.com" --s3-no-check-bucket :s3:bucket/file.gz';
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).toBe(cmd);
	});

	it("should handle commands with no credentials", () => {
		const cmd = "rclone lsf :s3:bucket/";
		expect(redactRcloneCredentials(cmd)).toBe(cmd);
	});

	it("should handle error strings containing credentials", () => {
		const errorStr =
			'Error: Command failed: rclone lsf --s3-access-key-id="MYKEY" --s3-secret-access-key="MYSECRET" :s3:bucket/';
		const redacted = redactRcloneCredentials(errorStr);
		expect(redacted).not.toContain("MYKEY");
		expect(redacted).not.toContain("MYSECRET");
		expect(redacted).toContain("[REDACTED]");
	});
});

describe("redactRcloneCredentials with getS3Credentials output (#5519)", () => {
	const buildCommand = (accessKey: string, secretAccessKey: string) =>
		`rclone rcat ${getS3Credentials({
			accessKey,
			secretAccessKey,
			region: "us-west-001",
			endpoint: "https://s3.us-west-001.backblazeb2.com",
			provider: "Other",
		} as Destination).join(" ")} :s3:bucket/file.gz`;

	it.each([
		[
			"plain alphanumeric",
			"001aaaabbbbccccdd0000000001",
			"K001FAKEfakeFAKEfake",
		],
		[
			"containing slashes",
			"AKIAIOSFODNN7EXAMPLE",
			"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		],
		["containing spaces", "key with space", "secret with space"],
		["containing quotes", "it's-a-key", `say "hi" it's`],
		["containing shell metacharacters", "key$HOME", "sec;ret`id`&|\\x"],
	])("redacts credentials %s", (_, accessKey, secretAccessKey) => {
		const redacted = redactRcloneCredentials(
			buildCommand(accessKey, secretAccessKey),
		);
		expect(redacted).toContain(
			'--s3-access-key-id="[REDACTED]" --s3-secret-access-key="[REDACTED]" --s3-region=us-west-001',
		);
		expect(redacted).not.toContain(accessKey);
		expect(redacted).not.toContain(secretAccessKey);
		expect(redacted).toContain(":s3:bucket/file.gz");
	});

	it("redacts credentials embedded in an error string", () => {
		const errorStr = `Error: Command failed: ${buildCommand("MYKEY", "MY/SECRET")}`;
		const redacted = redactRcloneCredentials(errorStr);
		expect(redacted).not.toContain("MYKEY");
		expect(redacted).not.toContain("MY/SECRET");
		expect(redacted).toContain("[REDACTED]");
	});
});

describe("redactRcloneCredentials pass flags (#5696)", () => {
	type Backend = "sftp" | "ftp" | "webdav";
	const builders: Record<Backend, typeof getSftpCredentials> = {
		sftp: getSftpCredentials,
		ftp: getFtpCredentials,
		webdav: getWebdavCredentials,
	};

	it.each(["sftp", "ftp", "webdav"] as const)(
		"redacts obscured pass with ) in the password (%s)",
		(backend) => {
			const destination = {
				accessKey: "user",
				secretAccessKey: "prefix)sensitiveSuffix",
				bucket: "backups",
				region: "22",
				endpoint: "host.example.com",
				provider: backend,
			} as Destination;
			const command = `rclone rcat ${builders[backend](destination).join(
				" ",
			)} :${backend}:${destination.bucket}`;

			const redacted = redactRcloneCredentials(command);

			expect(redacted).not.toContain("sensitiveSuffix");
			expect(redacted).not.toContain("prefix)");
			expect(redacted).not.toContain("rclone obscure");
			expect(redacted).toContain(`--${backend}-pass="[REDACTED]"`);
			expect(redacted).toContain(`--${backend}-user=user`);
			if (backend === "webdav") {
				expect(redacted).toContain(
					"--webdav-url=host.example.com --webdav-user=user",
				);
			} else {
				expect(redacted).toContain(
					`--${backend}-host=host.example.com --${backend}-user=user --${backend}-port=22`,
				);
			}
		},
	);

	it("redacts pass flags embedded in an error string", () => {
		const errorStr = `Error: Command failed: rclone rcat ${getSftpCredentials({
			accessKey: "u",
			secretAccessKey: "p@$$w)rd",
			bucket: "x",
			region: "",
			endpoint: "h",
			provider: "sftp",
		} as Destination).join(" ")}`;
		const redacted = redactRcloneCredentials(errorStr);
		expect(redacted).not.toContain("p@$$w)rd");
		expect(redacted).toContain('--sftp-pass="[REDACTED]"');
	});

	it("redacts a literal quoted pass value without substitution", () => {
		const redacted = redactRcloneCredentials(
			"rclone lsf --sftp-pass='plain)pass' :sftp:/backups",
		);
		expect(redacted).not.toContain("plain)pass'");
		expect(redacted).toContain('--sftp-pass="[REDACTED]" :sftp:/backups');
	});

	it("keeps neighbor commands intact when the password contains quotes", () => {
		const command = `rclone rcat ${getSftpCredentials({
			accessKey: "user",
			secretAccessKey: "it's-a-)pass",
			bucket: "x",
			region: "",
			endpoint: "h",
			provider: "sftp",
		} as Destination).join(" ")} '"echo next-command"'`;

		const redacted = redactRcloneCredentials(command);

		expect(redacted).not.toContain("it's-a-)pass");
		expect(redacted).toContain('--sftp-user=user --sftp-pass="[REDACTED]"');
		expect(redacted).toContain("echo next-command");
	});
});
