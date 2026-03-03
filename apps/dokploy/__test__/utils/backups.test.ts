import {
	getRcloneDestination,
	getRclonePrefixPath,
	getS3Credentials,
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

describe("rclone destination provider mapping", () => {
	const baseDestination = {
		destinationId: "dest_1",
		name: "test",
		organizationId: "org_1",
		createdAt: new Date(),
		accessKey: "key",
		secretAccessKey: "secret",
		bucket: "bucket-root",
		region: "us-east-1",
		endpoint: "endpoint",
		provider: "AWS",
	};

	test("should keep S3 behavior by default", () => {
		const flags = getS3Credentials(baseDestination);
		expect(flags.some((flag) => flag.includes("--s3-access-key-id"))).toBe(true);
		expect(getRcloneDestination(baseDestination, "prefix/file.sql.gz")).toBe(
			":s3:bucket-root/prefix/file.sql.gz",
		);
		expect(getRclonePrefixPath(baseDestination, "prefix")).toBe(
			":s3:bucket-root/prefix/",
		);
	});

	test("should generate ftp credentials and destination", () => {
		const ftp = {
			...baseDestination,
			provider: "FTP",
			bucket: "remote-root",
			endpoint: "ftp.example.com",
		};
		const flags = getS3Credentials(ftp);
		expect(flags.some((flag) => flag.includes("--ftp-host"))).toBe(true);
		expect(getRcloneDestination(ftp, "prefix/file.sql.gz")).toBe(
			":ftp:remote-root/prefix/file.sql.gz",
		);
		expect(getRclonePrefixPath(ftp, "prefix")).toBe(":ftp:remote-root/prefix/");
	});

	test("should generate sftp credentials and destination", () => {
		const sftp = {
			...baseDestination,
			provider: "SFTP",
			bucket: "remote-root",
			endpoint: "sftp.example.com",
		};
		const flags = getS3Credentials(sftp);
		expect(flags.some((flag) => flag.includes("--sftp-host"))).toBe(true);
		expect(getRcloneDestination(sftp, "prefix/file.sql.gz")).toBe(
			":sftp:remote-root/prefix/file.sql.gz",
		);
		expect(getRclonePrefixPath(sftp, "prefix")).toBe(
			":sftp:remote-root/prefix/",
		);
	});
});
