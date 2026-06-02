import { describe, expect, it } from "vitest";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { redactSecrets } from "@dokploy/server/utils/process/redactSecrets";

describe("secret redaction", () => {
	it("redacts S3 credentials from commands", () => {
		const command =
			'rclone cat --s3-access-key-id="AKIAEXAMPLEVALUE" --s3-secret-access-key="super-secret-value" ":s3:bucket/file.sql.gz"';

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain("AKIAEXAMPLEVALUE");
		expect(redacted).not.toContain("super-secret-value");
		expect(redacted).toContain("--s3-access-key-id=[redacted]");
		expect(redacted).toContain("--s3-secret-access-key=[redacted]");
	});

	it("redacts database passwords and docker login echoes", () => {
		const command =
			"echo registry-password | docker login registry.example.com -u user --password-stdin && mysql -u root -p'database-password' app";

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain("registry-password");
		expect(redacted).not.toContain("database-password");
		expect(redacted).toMatch(/echo \[redacted\]\s*\|\s*docker login/);
		expect(redacted).toContain("-p[redacted]");
	});

	it("stores redacted ExecError details", () => {
		const error = new ExecError(
			'Command failed: rclone ls --s3-secret-access-key="secret-key" ":s3:bucket"',
			{
				command:
					'rclone ls --s3-secret-access-key="secret-key" ":s3:bucket"',
				stderr: 'failed with --s3-secret-access-key="secret-key"',
				originalError: new Error(
					'Command failed: rclone ls --s3-secret-access-key="secret-key"',
				),
			},
		);

		expect(error.message).not.toContain("secret-key");
		expect(error.command).not.toContain("secret-key");
		expect(error.stderr).not.toContain("secret-key");
		expect(error.originalError?.message).not.toContain("secret-key");
		expect(error.getDetailedMessage()).not.toContain("secret-key");
	});
});
