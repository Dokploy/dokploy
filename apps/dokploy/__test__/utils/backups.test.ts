import { RCLONE_DESTINATION_PROVIDERS } from "@dokploy/server/db/validations/destination";
import {
	getRclonePathAndFlags,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

describe("normalizeS3Path", () => {
	test("should handle empty and whitespace-only prefix", () => {
		expect(normalizeS3Path("")).toBe("");
		expect(normalizeS3Path("/")).toBe("");
		expect(normalizeS3Path("  ")).toBe("");
		expect(normalizeS3Path("\t")).toBe("");
		expect(normalizeS3Path("\n")).toBe("");
		expect(normalizeS3Path(" \n \t ")).toBe("");
	});

	test("should trim whitespace from prefix", () => {
		expect(normalizeS3Path(" prefix")).toBe("prefix/");
		expect(normalizeS3Path("prefix ")).toBe("prefix/");
		expect(normalizeS3Path(" prefix ")).toBe("prefix/");
		expect(normalizeS3Path("\tprefix\t")).toBe("prefix/");
		expect(normalizeS3Path(" prefix/nested ")).toBe("prefix/nested/");
	});

	test("should remove leading slashes", () => {
		expect(normalizeS3Path("/prefix")).toBe("prefix/");
		expect(normalizeS3Path("///prefix")).toBe("prefix/");
	});

	test("should remove trailing slashes", () => {
		expect(normalizeS3Path("prefix/")).toBe("prefix/");
		expect(normalizeS3Path("prefix///")).toBe("prefix/");
	});

	test("should remove both leading and trailing slashes", () => {
		expect(normalizeS3Path("/prefix/")).toBe("prefix/");
		expect(normalizeS3Path("///prefix///")).toBe("prefix/");
	});

	test("should handle nested paths", () => {
		expect(normalizeS3Path("prefix/nested")).toBe("prefix/nested/");
		expect(normalizeS3Path("/prefix/nested/")).toBe("prefix/nested/");
		expect(normalizeS3Path("///prefix/nested///")).toBe("prefix/nested/");
	});

	test("should preserve middle slashes", () => {
		expect(normalizeS3Path("prefix/nested/deep")).toBe("prefix/nested/deep/");
		expect(normalizeS3Path("/prefix/nested/deep/")).toBe("prefix/nested/deep/");
	});

	test("should handle special characters", () => {
		expect(normalizeS3Path("prefix-with-dashes")).toBe("prefix-with-dashes/");
		expect(normalizeS3Path("prefix_with_underscores")).toBe(
			"prefix_with_underscores/",
		);
		expect(normalizeS3Path("prefix.with.dots")).toBe("prefix.with.dots/");
	});

	test("should handle the cases from the bug report", () => {
		expect(normalizeS3Path("instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("/instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("instance-backups")).toBe("instance-backups/");
	});
});

const destination = (overrides: Record<string, unknown> = {}) =>
	({
		destinationId: "destination-id",
		name: "Test",
		provider: "AWS",
		accessKey: "access",
		secretAccessKey: "secret",
		bucket: "bucket",
		region: "us-east-1",
		endpoint: "https://s3.example.com",
		additionalFlags: [],
		organizationId: "organization-id",
		createdAt: new Date(0),
		...overrides,
	}) as any;

describe("getRclonePathAndFlags", () => {
	test("preserves the existing S3 destination behavior", async () => {
		const result = await getRclonePathAndFlags(
			destination(),
			"service/prefix/backup.sql.gz",
		);

		expect(result.path).toBe(":s3:bucket/service/prefix/backup.sql.gz");
		expect(result.flags).toContain("--s3-provider=AWS");
		expect(result.flags).toContain("--s3-access-key-id=access");
		expect(result.flags).toContain("--s3-secret-access-key=secret");
	});

	test.each([
		RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
		RCLONE_DESTINATION_PROVIDERS.ONEDRIVE,
		RCLONE_DESTINATION_PROVIDERS.REMOTE,
	])("builds a safe named rclone remote for %s", async (provider) => {
		const result = await getRclonePathAndFlags(
			destination({
				provider,
				endpoint: "team-drive",
				bucket: "/dokploy/",
				accessKey: "",
				secretAccessKey: "",
				region: "",
				additionalFlags: ["--transfers=2"],
			}),
			"/service/backup.sql.gz",
		);

		expect(result.path).toBe("team-drive:dokploy/service/backup.sql.gz");
		expect(result.flags).toEqual(["--transfers=2"]);
	});

	test("rejects unsafe named remote names", async () => {
		await expect(
			getRclonePathAndFlags(
				destination({
					provider: RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
					endpoint: "drive;touch /tmp/pwned",
					bucket: "",
				}),
			),
		).rejects.toThrow("Invalid rclone remote name");
	});

	test.each([
		[RCLONE_DESTINATION_PROVIDERS.FTP, "ftp", "21"],
		[RCLONE_DESTINATION_PROVIDERS.SFTP, "sftp", "22"],
	] as const)(
		"builds stateless %s flags and destination without invoking password obscuring when password is empty",
		async (provider, backend, defaultPort) => {
			const result = await getRclonePathAndFlags(
				destination({
					provider,
					endpoint: "storage.example.com",
					accessKey: "backup-user",
					secretAccessKey: "",
					region: "",
					bucket: "/backups/",
				}),
				"service/backup.tar",
			);

			expect(result.path).toBe(
				`:${backend}:backups/service/backup.tar`,
			);
			expect(result.flags).toContain(
				`--${backend}-host=storage.example.com`,
			);
			expect(result.flags).toContain(`--${backend}-user=backup-user`);
			expect(result.flags).toContain(`--${backend}-port=${defaultPort}`);
			expect(result.flags.some((flag) => flag.startsWith(`--${backend}-pass=`))).toBe(
				false,
			);
		},
	);
});
