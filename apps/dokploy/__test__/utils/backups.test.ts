import type { Destination } from "@dokploy/server/services/destination";
import {
	getRcloneDestination,
	getRcloneDestinationProvider,
	getRcloneFlags,
	normalizeRclonePath,
	normalizeS3Path,
	shellQuote,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

const createDestination = (
	overrides: Partial<Destination> = {},
): Destination => ({
	destinationId: "destination",
	name: "Backups",
	provider: "AWS",
	accessKey: "access-key",
	secretAccessKey: "secret-key",
	bucket: "dokploy-backups",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	additionalFlags: [],
	organizationId: "organization",
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	...overrides,
});

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

describe("rclone destination providers", () => {
	test("should keep existing S3 providers mapped to the s3 backend", () => {
		const destination = createDestination({ provider: "Cloudflare" });

		expect(getRcloneDestinationProvider(destination)).toBe("s3");
		expect(getRcloneDestination(destination, "app/prefix/backup.sql.gz")).toBe(
			":s3:dokploy-backups/app/prefix/backup.sql.gz",
		);
		expect(getRcloneFlags(destination)).toEqual([
			"--s3-provider='Cloudflare'",
			"--s3-access-key-id='access-key'",
			"--s3-secret-access-key='secret-key'",
			"--s3-region='us-east-1'",
			"--s3-endpoint='https://s3.example.com'",
			"--s3-no-check-bucket",
			"--s3-force-path-style",
		]);
	});

	test("should build FTP flags and preserve absolute base paths", () => {
		const destination = createDestination({
			provider: "ftp",
			accessKey: "backup-user",
			secretAccessKey: "pa'ss word",
			bucket: "/srv/backups",
			region: "2121",
			endpoint: "ftp.example.com",
		});

		expect(getRcloneDestinationProvider(destination)).toBe("ftp");
		expect(getRcloneDestination(destination, "app/backup.sql.gz")).toBe(
			":ftp:/srv/backups/app/backup.sql.gz",
		);
		expect(getRcloneFlags(destination)).toEqual([
			"--ftp-host='ftp.example.com'",
			"--ftp-user='backup-user'",
			"--ftp-port='2121'",
			"--ftp-pass=$(rclone obscure 'pa'\\''ss word')",
		]);
	});

	test("should build SFTP flags with additional rclone options", () => {
		const destination = createDestination({
			provider: "sftp",
			accessKey: "dokploy",
			secretAccessKey: "secret",
			bucket: "relative/backups",
			region: "",
			endpoint: "sftp.example.com",
			additionalFlags: ["--sftp-known-hosts-file=/root/.ssh/known_hosts"],
		});

		expect(getRcloneDestination(destination, "app/backup.sql.gz")).toBe(
			":sftp:relative/backups/app/backup.sql.gz",
		);
		expect(getRcloneFlags(destination)).toEqual([
			"--sftp-host='sftp.example.com'",
			"--sftp-user='dokploy'",
			"--sftp-pass=$(rclone obscure 'secret')",
			"--sftp-known-hosts-file=/root/.ssh/known_hosts",
		]);
	});

	test("should build Google Drive flags from token JSON", () => {
		const token =
			'{"access_token":"access","token_type":"Bearer","refresh_token":"refresh","expiry":"2026-01-01T00:00:00Z"}';
		const destination = createDestination({
			provider: "drive",
			accessKey: "client-id",
			secretAccessKey: "client-secret",
			bucket: "Dokploy Backups",
			region: "root-folder-id",
			endpoint: token,
		});

		expect(getRcloneDestination(destination, "app/backup.sql.gz")).toBe(
			":drive:Dokploy Backups/app/backup.sql.gz",
		);
		expect(getRcloneFlags(destination)).toEqual([
			"--drive-client-id='client-id'",
			"--drive-client-secret='client-secret'",
			`--drive-token=${shellQuote(token)}`,
			"--drive-root-folder-id='root-folder-id'",
		]);
	});

	test("should build OneDrive flags without optional client credentials", () => {
		const token = '{"access_token":"access","refresh_token":"refresh"}';
		const destination = createDestination({
			provider: "onedrive",
			accessKey: "",
			secretAccessKey: "",
			bucket: "",
			region: "drive-id",
			endpoint: token,
		});

		expect(getRcloneDestination(destination, "app/backup.sql.gz")).toBe(
			":onedrive:app/backup.sql.gz",
		);
		expect(getRcloneFlags(destination)).toEqual([
			`--onedrive-token=${shellQuote(token)}`,
			"--onedrive-drive-id='drive-id'",
		]);
	});

	test("should normalize rclone paths while preserving FTP/SFTP root semantics", () => {
		expect(
			normalizeRclonePath("/absolute/path/", { preserveLeadingSlash: true }),
		).toBe("/absolute/path/");
		expect(normalizeRclonePath("/absolute/path/")).toBe("absolute/path/");
	});

	test("should quote shell values safely", () => {
		expect(shellQuote("path/with spaces")).toBe("'path/with spaces'");
		expect(shellQuote("value'with'quotes")).toBe("'value'\\''with'\\''quotes'");
	});
});
