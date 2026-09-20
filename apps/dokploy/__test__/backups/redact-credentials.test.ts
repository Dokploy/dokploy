import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
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

describe("redactRcloneCredentials quoting styles", () => {
	it("should redact single-quoted values (shell-quote output)", () => {
		const cmd =
			"rclone rcat --s3-access-key-id='AKIAIOSFODNN7EXAMPLE' --s3-secret-access-key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' :s3:bucket/file.gz";
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
		expect(redacted).not.toContain("wJalrXUtnFEMI");
		expect(redacted).toContain('--s3-access-key-id="[REDACTED]"');
	});

	it("should redact bare (unquoted) values", () => {
		const cmd =
			"rclone rcat --sftp-pass=hunter2 --sftp-user=bob :sftp:/backups/file.gz";
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("hunter2");
		expect(redacted).toContain("--sftp-user=bob");
	});
});

describe("redactRcloneCredentials non-s3 providers", () => {
	it("should redact ftp pass flags", () => {
		const cmd = "rclone ls --ftp-host=h --ftp-pass='my pw' :ftp:/backups";
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("my pw");
		expect(redacted).toContain("--ftp-host=h");
		expect(redacted).toContain('--ftp-pass="[REDACTED]"');
	});

	it("should redact sftp key material flags", () => {
		const cmd =
			'rclone ls --sftp-host=h --sftp-key-pem="-----BEGIN KEY-----" --sftp-key-file=/home/u/id :sftp:/b';
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("BEGIN KEY");
		expect(redacted).not.toContain("/home/u/id");
	});

	it("should redact oauth token and client secret flags", () => {
		const cmd =
			'rclone ls --drive-client-secret="gcs123" --drive-token=\'{"access_token":"ya29.tok"}\' --drive-scope=drive :drive:backups';
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("gcs123");
		expect(redacted).not.toContain("ya29.tok");
		expect(redacted).toContain("--drive-scope=drive");
	});

	it("should redact generic backend key flags", () => {
		const cmd = "rclone ls --b2-account=acc --b2-key=masterkey :b2:backups";
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("masterkey");
		expect(redacted).toContain("--b2-account=acc");
	});

	it("fully redacts values with POSIX escaped apostrophes", () => {
		// POSIX shell quoting of "it's"/"a'b" produces concatenated segments
		// like 'it'\''s' which must be consumed as one token.
		const cmd = `rclone ls --ftp-pass='it'\\''s' --drive-token='{"a":"b'\\''c"}' :ftp:/x`;
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).toBe(
			`rclone ls --ftp-pass="[REDACTED]" --drive-token="[REDACTED]" :ftp:/x`,
		);
	});

	it("redacts single-quoted values containing a backslash", () => {
		// shell-quote emits 'trailing\' for a value ending in a backslash —
		// the backslash is literal inside single quotes and must not stop
		// the matcher at the quote.
		const cmd = `rclone ls --ftp-pass='trailing\\' --sftp-user=bob :ftp:/x`;
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).toBe(
			`rclone ls --ftp-pass="[REDACTED]" --sftp-user=bob :ftp:/x`,
		);
	});

	it("redacts double-quoted values containing escaped quotes", () => {
		const cmd = `rclone ls --drive-token="{\\"a\\":\\"sec\\"}" --drive-scope=drive :drive:/x`;
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).toBe(
			`rclone ls --drive-token="[REDACTED]" --drive-scope=drive :drive:/x`,
		);
	});
});
