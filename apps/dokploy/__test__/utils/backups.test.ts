import { apiCreateDestination } from "@dokploy/server/db/schema/destination";
import { RCLONE_DESTINATION_PROVIDERS } from "@dokploy/server/db/validations/destination";
import {
	getRclonePathAndFlags,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { normalizeVolumeBackupFilePath } from "@dokploy/server/utils/volume-backups/restore";
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

describe("normalizeVolumeBackupFilePath", () => {
	test("accepts a destination-relative backup path", () => {
		expect(normalizeVolumeBackupFilePath("app/prefix/volume-2026.tar")).toBe(
			"app/prefix/volume-2026.tar",
		);
	});

	test.each([
		"/absolute/backup.tar",
		"../backup.tar",
		"app/../backup.tar",
		"backup.tar; touch /tmp/pwned",
		"backup.tar$(touch /tmp/pwned)",
		"backup.tar`touch /tmp/pwned`",
		"backup.tar\nmalicious-command",
	])("rejects unsafe restore path %s", (value) => {
		expect(() => normalizeVolumeBackupFilePath(value)).toThrow(
			"Invalid volume backup file path",
		);
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

describe("FTP destination validation", () => {
	const input = {
		name: "FTP backups",
		provider: RCLONE_DESTINATION_PROVIDERS.FTP,
		accessKey: "backup-user",
		secretAccessKey: "secret",
		bucket: "backups",
		region: "",
		endpoint: "storage.example.com",
	};

	test("rejects plaintext FTP", () => {
		expect(
			apiCreateDestination.safeParse({ ...input, additionalFlags: [] }).success,
		).toBe(false);
	});

	test.each(["--ftp-explicit-tls", "--ftp-tls"])(
		"accepts encrypted FTP with %s",
		(flag) => {
			const result = apiCreateDestination.safeParse({
				...input,
				additionalFlags: [flag],
			});
			expect(
				result.success,
				result.success ? undefined : JSON.stringify(result.error.issues),
			).toBe(true);
		},
	);

	test("rejects conflicting implicit and explicit FTPS", () => {
		expect(
			apiCreateDestination.safeParse({
				...input,
				additionalFlags: ["--ftp-explicit-tls", "--ftp-tls"],
			}).success,
		).toBe(false);
	});
});

describe("SFTP destination validation", () => {
	const input = {
		name: "SFTP backups",
		provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
		accessKey: "backup-user",
		secretAccessKey: "",
		bucket: "backups",
		region: "",
		endpoint: "storage.example.com",
	};

	test("rejects SFTP without host-key verification", () => {
		expect(
			apiCreateDestination.safeParse({ ...input, additionalFlags: [] }).success,
		).toBe(false);
	});

	test("rejects explicitly disabled SFTP host-key verification", () => {
		expect(
			apiCreateDestination.safeParse({
				...input,
				additionalFlags: ["--sftp-known-hosts-file=none"],
			}).success,
		).toBe(false);
	});

	test("accepts SFTP with a known-hosts file", () => {
		const result = apiCreateDestination.safeParse({
			...input,
			additionalFlags: ["--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts"],
		});
		expect(
			result.success,
			result.success ? undefined : JSON.stringify(result.error.issues),
		).toBe(true);
	});
});

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

	test("rejects unsafe stored additional flags at runtime", async () => {
		await expect(
			getRclonePathAndFlags(
				destination({ additionalFlags: ["--transfers=2;touch /tmp/pwned"] }),
			),
		).rejects.toThrow("Invalid flag format");
	});

	test.each([
		["--ftp-explicit-tls", "21"],
		["--ftp-tls", "990"],
	] as const)(
		"uses secure FTP mode %s with default port %s",
		async (tlsFlag, defaultPort) => {
			const result = await getRclonePathAndFlags(
				destination({
					provider: RCLONE_DESTINATION_PROVIDERS.FTP,
					endpoint: "storage.example.com",
					accessKey: "backup-user",
					secretAccessKey: "",
					region: "",
					bucket: "/backups/",
					additionalFlags: [tlsFlag],
				}),
				"service/backup.tar",
			);

			expect(result.path).toBe(":ftp:backups/service/backup.tar");
			expect(result.flags).toContain("--ftp-host=storage.example.com");
			expect(result.flags).toContain("--ftp-user=backup-user");
			expect(result.flags).toContain(`--ftp-port=${defaultPort}`);
			expect(result.flags).toContain(tlsFlag);
		},
	);

	test("rejects plaintext FTP at runtime", async () => {
		await expect(
			getRclonePathAndFlags(
				destination({
					provider: RCLONE_DESTINATION_PROVIDERS.FTP,
					endpoint: "storage.example.com",
					accessKey: "backup-user",
					secretAccessKey: "",
					region: "",
					bucket: "/backups/",
					additionalFlags: [],
				}),
			),
		).rejects.toThrow("FTP destinations must use TLS");
	});

	test("builds SFTP flags with host-key verification and port 22", async () => {
		const result = await getRclonePathAndFlags(
			destination({
				provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
				endpoint: "storage.example.com",
				accessKey: "backup-user",
				secretAccessKey: "",
				region: "",
				bucket: "/backups/",
				additionalFlags: ["--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts"],
			}),
			"service/backup.tar",
		);

		expect(result.path).toBe(":sftp:backups/service/backup.tar");
		expect(result.flags).toContain("--sftp-host=storage.example.com");
		expect(result.flags).toContain("--sftp-user=backup-user");
		expect(result.flags).toContain("--sftp-port=22");
		expect(result.flags).toContain(
			"--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts",
		);
	});

	test("rejects SFTP without host-key verification at runtime", async () => {
		await expect(
			getRclonePathAndFlags(
				destination({
					provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
					endpoint: "storage.example.com",
					accessKey: "backup-user",
					secretAccessKey: "",
					region: "",
					bucket: "/backups/",
					additionalFlags: [],
				}),
			),
		).rejects.toThrow("SFTP destinations must verify the server host key");
	});
});

describe("FTP TLS certificate verification", () => {
	const input = {
		name: "FTP backups",
		provider: RCLONE_DESTINATION_PROVIDERS.FTP,
		accessKey: "backup-user",
		secretAccessKey: "secret",
		bucket: "backups",
		region: "",
		endpoint: "storage.example.com",
	};

	test.each(["--ftp-no-check-certificate", "--no-check-certificate"])(
		"rejects certificate-verification bypass %s at schema validation",
		(flag) => {
			expect(
				apiCreateDestination.safeParse({
					...input,
					additionalFlags: ["--ftp-explicit-tls", flag],
				}).success,
			).toBe(false);
		},
	);

	test.each(["--ftp-no-check-certificate", "--no-check-certificate"])(
		"rejects certificate-verification bypass %s at runtime",
		async (flag) => {
			await expect(
				getRclonePathAndFlags(
					destination({
						provider: RCLONE_DESTINATION_PROVIDERS.FTP,
						endpoint: "storage.example.com",
						accessKey: "backup-user",
						secretAccessKey: "",
						region: "",
						bucket: "backups",
						additionalFlags: ["--ftp-explicit-tls", flag],
					}),
				),
			).rejects.toThrow("FTP TLS certificate verification cannot be disabled");
		},
	);

	test.each([
		"--ftp-no-check-certificate=false",
		"--no-check-certificate=false",
	])("allows explicitly safe certificate flag %s", (flag) => {
		expect(
			apiCreateDestination.safeParse({
				...input,
				additionalFlags: ["--ftp-explicit-tls", flag],
			}).success,
		).toBe(true);
	});
});
