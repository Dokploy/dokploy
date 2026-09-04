import { RCLONE_DESTINATION_PROVIDERS } from "@dokploy/server/db/validations/destination";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import {
	assertSafeRclonePath,
	getRclonePathAndFlags,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

const destination = (overrides: Record<string, unknown> = {}) =>
	({
		destinationId: "destination-id",
		name: "Test",
		provider: RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
		accessKey: "",
		secretAccessKey: "",
		bucket: "dokploy",
		region: "",
		endpoint: "team-drive",
		additionalFlags: [],
		organizationId: "organization-id",
		createdAt: new Date(0),
		...overrides,
	}) as any;

describe("issue #416 rclone path safety", () => {
	test.each([
		"../backup.sql.gz",
		"app/../backup.sql.gz",
		"app/./backup.sql.gz",
		"..\\backup.sql.gz",
		"app\\..\\backup.sql.gz",
		"backup.sql.gz\nother",
		"backup.sql.gz\rboom",
		"backup.sql.gz\0boom",
	])("rejects unsafe destination-relative path %s", (value) => {
		expect(() => assertSafeRclonePath(value)).toThrow("Invalid rclone path");
	});

	test.each([
		"service/backup.sql.gz",
		"/service/backup.sql.gz",
		"service/backup..sql.gz",
		"service/file name.sql.gz",
	])("keeps valid backup path %s", (value) => {
		expect(() => assertSafeRclonePath(value)).not.toThrow();
	});

	test.each([
		RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
		RCLONE_DESTINATION_PROVIDERS.ONEDRIVE,
		RCLONE_DESTINATION_PROVIDERS.REMOTE,
		RCLONE_DESTINATION_PROVIDERS.FTP,
		RCLONE_DESTINATION_PROVIDERS.SFTP,
		"AWS",
	])("blocks traversal before building a %s target", async (provider) => {
		await expect(
			getRclonePathAndFlags(destination({ provider }), "app/../outside.sql.gz"),
		).rejects.toThrow("Invalid rclone path");
	});
});

describe("issue #416 credential redaction", () => {
	test("redacts an SFTP private-key passphrase flag", () => {
		const command =
			"rclone lsf --sftp-key-file=/root/.ssh/id_rsa --sftp-key-file-pass=obscured-secret :sftp:backups";
		const redacted = redactRcloneCredentials(command);

		expect(redacted).not.toContain("obscured-secret");
		expect(redacted).toContain('--sftp-key-file-pass="[REDACTED]"');
	});
});
