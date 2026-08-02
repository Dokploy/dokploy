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

// Reproduction of the leak observed in production on v0.29.13:
// getS3Credentials() emits shell-quote'd values, and shell-quote leaves
// "safe" values (hex keys, tokens without spaces) UNQUOTED. The original
// redactRcloneCredentials() only masked the double-quoted form, so those
// values leaked into structured logs and error output.
// All values below are deliberately fake.
describe("redactRcloneCredentials — unquoted/variant forms (leak reproduction)", () => {
	const FAKE_ACCESS = "FAKE_R2_ACCESS_KEY_0123456789";
	const FAKE_SECRET = "FAKE_R2_SECRET_KEY_ABCDEFGHIJKLMNOPQRSTUVWXYZ";

	const expectClean = (output: string) => {
		expect(output).not.toContain(FAKE_ACCESS);
		expect(output).not.toContain(FAKE_SECRET);
	};

	it("redacts unquoted --flag=value (shell-quote output for hex keys)", () => {
		const cmd = `rclone rcat --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key=${FAKE_SECRET} --s3-region=auto ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted).toContain("--s3-access-key-id=[REDACTED]");
		expect(redacted).toContain("--s3-secret-access-key=[REDACTED]");
		expect(redacted).toContain("--s3-region=auto");
	});

	it('redacts double-quoted --flag="value"', () => {
		const cmd = `rclone rcat --s3-access-key-id="${FAKE_ACCESS}" --s3-secret-access-key="${FAKE_SECRET}" ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted).toContain('--s3-access-key-id="[REDACTED]"');
		expect(redacted).toContain('--s3-secret-access-key="[REDACTED]"');
	});

	it("redacts single-quoted --flag='value'", () => {
		const cmd = `rclone rcat --s3-access-key-id='${FAKE_ACCESS}' --s3-secret-access-key='${FAKE_SECRET}' ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted).toContain("--s3-access-key-id='[REDACTED]'");
	});

	it("redacts space-separated --flag value", () => {
		const cmd = `rclone rcat --s3-access-key-id ${FAKE_ACCESS} --s3-secret-access-key ${FAKE_SECRET} ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted).toContain("--s3-access-key-id [REDACTED]");
	});

	it("redacts space-separated quoted values", () => {
		const cmd = `rclone rcat --s3-access-key-id "${FAKE_ACCESS}" --s3-secret-access-key '${FAKE_SECRET}' ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
	});

	it("redacts credentials in reverse argument order", () => {
		const cmd = `rclone rcat --s3-secret-access-key=${FAKE_SECRET} --s3-region=auto --s3-access-key-id=${FAKE_ACCESS} ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted).toContain("--s3-region=auto");
	});

	it("keeps non-sensitive arguments intact", () => {
		const cmd = `rclone copyto --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key=${FAKE_SECRET} --s3-no-check-bucket --s3-force-path-style --s3-endpoint=https://fake.endpoint.example ":s3:bucket/a.tar"`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted).toContain("--s3-no-check-bucket");
		expect(redacted).toContain("--s3-force-path-style");
		expect(redacted).toContain("--s3-endpoint=https://fake.endpoint.example");
		expect(redacted).toContain(":s3:bucket/a.tar");
	});

	it("redacts credentials inside an error message echoing the command", () => {
		const err = `Command execution failed: Command failed: rclone rcat --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key=${FAKE_SECRET} ":s3:bucket/file.gz"\nERROR : s3: upload failed`;
		const redacted = redactRcloneCredentials(err);
		expectClean(redacted);
		expect(redacted).toContain("ERROR : s3: upload failed");
	});

	it("redacts shell-escaped values (single-quote idiom and special chars)", () => {
		// shell-quote renders a value containing a single quote as 'a'\''b'
		const cmd = `rclone rcat --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key='${FAKE_SECRET}'\\''pwned' ":s3:bucket/file.gz"`;
		const redacted = redactRcloneCredentials(cmd);
		expect(redacted).not.toContain(FAKE_SECRET);
		expect(redacted).not.toContain("pwned");
	});

	it("is idempotent", () => {
		const cmd = `rclone rcat --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key="${FAKE_SECRET}" ":s3:bucket/file.gz"`;
		const once = redactRcloneCredentials(cmd);
		expectClean(once);
		expect(redactRcloneCredentials(once)).toBe(once);
	});

	it("handles empty or malformed input safely", () => {
		expect(redactRcloneCredentials("")).toBe("");
		expect(redactRcloneCredentials("--s3-access-key-id=")).toBe(
			"--s3-access-key-id=",
		);
		expect(redactRcloneCredentials("--s3-access-key-id")).toBe(
			"--s3-access-key-id",
		);
	});

	it("never leaves the fake secrets in the output of a full pipeline command", () => {
		const cmd = `rclone lsf --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key=${FAKE_SECRET} --include "*.sql.gz" :s3:bucket/app/ | sort -r | tail -n +31 | xargs -I{} rclone delete --s3-access-key-id=${FAKE_ACCESS} --s3-secret-access-key=${FAKE_SECRET} :s3:bucket/app/{}`;
		const redacted = redactRcloneCredentials(cmd);
		expectClean(redacted);
		expect(redacted.match(/\[REDACTED\]/g)).toHaveLength(4);
	});
});
