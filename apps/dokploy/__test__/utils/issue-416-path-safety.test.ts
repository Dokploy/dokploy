import {
	apiCreateDestination,
	apiUpdateDestination,
} from "@dokploy/server/db/schema/destination";
import { RCLONE_DESTINATION_PROVIDERS } from "@dokploy/server/db/validations/destination";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import {
	assertSafeRclonePath,
	getRclonePathAndFlags,
} from "@dokploy/server/utils/backups/utils";
import {
	normalizeDockerVolumeName,
	normalizeVolumeBackupFilePath,
} from "@dokploy/server/utils/volume-backups/restore";
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

describe("issue #416 SFTP host-key safety", () => {
	const conflictingKnownHostsFlags = [
		"--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts",
		"--sftp-known-hosts-file=none",
	];

	test("rejects conflicting host-key flags during destination validation", () => {
		const result = apiCreateDestination.safeParse({
			name: "SFTP backups",
			provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
			accessKey: "backup-user",
			secretAccessKey: "",
			bucket: "backups",
			region: "",
			endpoint: "storage.example.com",
			additionalFlags: conflictingKnownHostsFlags,
		});

		expect(result.success).toBe(false);
	});

	test("rejects conflicting host-key flags at runtime", async () => {
		await expect(
			getRclonePathAndFlags(
				destination({
					provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
					endpoint: "storage.example.com",
					accessKey: "backup-user",
					secretAccessKey: "",
					region: "",
					bucket: "backups",
					additionalFlags: conflictingKnownHostsFlags,
				}),
			),
		).rejects.toThrow("SFTP destinations must verify the server host key");
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

const unsafeDestinationBuckets = [
	"..",
	".",
	"../outside",
	"safe/../outside",
	"safe/./outside",
	"safe\\..\\outside",
	"safe\\outside",
	"safe%2f..%2foutside",
	"safe/%2e%2e/outside",
	"safe/%252e%252e%252foutside",
	"safe/%2e%2e%5coutside",
	"safe/%5coutside",
	"safe/%255coutside",
	"safe/%ZZ",
	"bucket\0next",
	"bucket\rnext",
	"bucket\nnext",
];

const destinationSchemaInput = (
	bucket: string,
	provider: string = RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
) => ({
	name: "Destination safety",
	provider,
	accessKey:
		provider === RCLONE_DESTINATION_PROVIDERS.FTP ||
		provider === RCLONE_DESTINATION_PROVIDERS.SFTP
			? "backup-user"
			: "",
	secretAccessKey: "",
	bucket,
	region:
		provider === RCLONE_DESTINATION_PROVIDERS.FTP ||
		provider === RCLONE_DESTINATION_PROVIDERS.SFTP
			? "22"
			: "",
	endpoint:
		provider === RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE ||
		provider === RCLONE_DESTINATION_PROVIDERS.ONEDRIVE ||
		provider === RCLONE_DESTINATION_PROVIDERS.REMOTE
			? "team-drive"
			: "storage.example.com",
	additionalFlags:
		provider === RCLONE_DESTINATION_PROVIDERS.FTP
			? ["--ftp-explicit-tls"]
			: provider === RCLONE_DESTINATION_PROVIDERS.SFTP
				? ["--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts"]
				: [],
});

const destinationRuntimeCases = [
	{
		provider: "AWS",
		endpoint: "s3.example.com",
		region: "us-east-1",
	},
	{
		provider: RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
		endpoint: "team-drive",
		region: "",
	},
	{
		provider: RCLONE_DESTINATION_PROVIDERS.ONEDRIVE,
		endpoint: "team-drive",
		region: "",
	},
	{
		provider: RCLONE_DESTINATION_PROVIDERS.REMOTE,
		endpoint: "team-drive",
		region: "",
	},
	{
		provider: RCLONE_DESTINATION_PROVIDERS.FTP,
		endpoint: "storage.example.com",
		region: "21",
		accessKey: "backup-user",
		additionalFlags: ["--ftp-explicit-tls"],
	},
	{
		provider: RCLONE_DESTINATION_PROVIDERS.SFTP,
		endpoint: "storage.example.com",
		region: "22",
		accessKey: "backup-user",
		additionalFlags: ["--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts"],
	},
];

describe("issue #416 destination base path safety", () => {
	test.each(unsafeDestinationBuckets)(
		"rejects unsafe bucket in create and update schemas: %s",
		(bucket) => {
			const input = destinationSchemaInput(bucket);

			expect(apiCreateDestination.safeParse(input).success).toBe(false);
			expect(
				apiUpdateDestination.safeParse({
					...input,
					destinationId: "destination-id",
				}).success,
			).toBe(false);
		},
	);

	test.each([
		RCLONE_DESTINATION_PROVIDERS.GOOGLE_DRIVE,
		RCLONE_DESTINATION_PROVIDERS.ONEDRIVE,
		RCLONE_DESTINATION_PROVIDERS.REMOTE,
		"AWS",
	])(
		"rejects an absolute base for object-style provider %s",
		async (provider) => {
			const input = destinationSchemaInput("/absolute", provider);
			expect(apiCreateDestination.safeParse(input).success).toBe(false);
			await expect(
				getRclonePathAndFlags(
					destination({
						provider,
						endpoint: provider === "AWS" ? "s3.example.com" : "team-drive",
						bucket: "/absolute",
					}),
					"service/backup.tar",
				),
			).rejects.toThrow("Invalid rclone path");
		},
	);

	test.each([
		RCLONE_DESTINATION_PROVIDERS.FTP,
		RCLONE_DESTINATION_PROVIDERS.SFTP,
	])(
		"accepts an absolute base for file-transfer provider %s",
		async (provider) => {
			const input = destinationSchemaInput("/backups/", provider);
			expect(apiCreateDestination.safeParse(input).success).toBe(true);
			expect(
				apiUpdateDestination.safeParse({
					...input,
					destinationId: "destination-id",
				}).success,
			).toBe(true);

			const result = await getRclonePathAndFlags(
				destination({
					provider,
					endpoint: "storage.example.com",
					accessKey: "backup-user",
					region: provider === RCLONE_DESTINATION_PROVIDERS.FTP ? "21" : "22",
					additionalFlags:
						provider === RCLONE_DESTINATION_PROVIDERS.FTP
							? ["--ftp-explicit-tls"]
							: ["--sftp-known-hosts-file=/etc/ssh/ssh_known_hosts"],
					bucket: "/backups/",
				}),
				"service/backup.tar",
			);
			expect(result.path).toBe(
				provider === RCLONE_DESTINATION_PROVIDERS.FTP
					? ":ftp:/backups/service/backup.tar"
					: ":sftp:/backups/service/backup.tar",
			);
		},
	);

	test.each(destinationRuntimeCases)(
		"rejects unsafe bucket before building a $provider target",
		async ({ provider, ...overrides }) => {
			for (const bucket of unsafeDestinationBuckets) {
				await expect(
					getRclonePathAndFlags(
						destination({
							provider,
							...overrides,
							bucket,
						}),
					),
				).rejects.toThrow("Invalid rclone path");
			}
		},
	);
});

describe("issue #416 volume name and backup path shell safety", () => {
	test("accepts valid docker volume names", () => {
		expect(normalizeDockerVolumeName("app_data")).toBe("app_data");
		expect(normalizeDockerVolumeName("App.Data-1")).toBe("App.Data-1");
	});

	test.each(["", "../evil", "vol;rm -rf /", "vol$(id)", "-sneaky"])(
		"rejects unsafe docker volume name %s",
		(value) => {
			expect(() => normalizeDockerVolumeName(value)).toThrow(
				"Invalid docker volume name",
			);
		},
	);

	test("normalizes generated backup file names", () => {
		expect(
			normalizeVolumeBackupFilePath("app_data-2026-01-01T00-00-00.tar"),
		).toBe("app_data-2026-01-01T00-00-00.tar");
	});
});
