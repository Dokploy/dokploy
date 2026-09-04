import {
	getSafeRcloneErrorMessage,
	redactRcloneCredentials,
} from "@dokploy/server/utils/backups/redact";
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

	it("should redact FTP and SFTP obscured password flags", () => {
		for (const backend of ["ftp", "sftp"] as const) {
			const cmd = `rclone lsf --${backend}-host=storage.example.com --${backend}-pass='obscured-secret' :${backend}:backups`;
			const redacted = redactRcloneCredentials(cmd);
			expect(redacted).not.toContain("obscured-secret");
			expect(redacted).toContain(`--${backend}-pass="[REDACTED]"`);
		}
	});

	it("should redact unquoted FTP and SFTP password flags", () => {
		const cmd =
			"rclone lsf --ftp-pass=ftp-secret --sftp-pass=sftp-secret :ftp:backups";
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain("ftp-secret");
		expect(redacted).not.toContain("sftp-secret");
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
	it("should sanitize rclone credentials from propagated backup errors", () => {
		const error = new Error(
			"Command failed: rclone rcat --s3-access-key-id=ACCESS_VALUE_9X --s3-secret-access-key=S3_VALUE_LEAK_9X --ftp-pass=FTP_VALUE_LEAK_9X --sftp-pass=SFTP_VALUE_LEAK_9X --sftp-key-file-pass=KEY_VALUE_LEAK_9X :ftp:backups/file.gz",
		);
		const safe = getSafeRcloneErrorMessage(error);

		for (const secret of [
			"ACCESS_VALUE_9X",
			"S3_VALUE_LEAK_9X",
			"FTP_VALUE_LEAK_9X",
			"SFTP_VALUE_LEAK_9X",
			"KEY_VALUE_LEAK_9X",
		]) {
			expect(safe).not.toContain(secret);
		}
		expect(safe.match(/\[REDACTED\]/g)?.length).toBe(5);
	});
});
