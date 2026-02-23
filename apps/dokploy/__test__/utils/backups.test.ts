import {
	getRcloneDestinationBase,
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

describe("getRcloneDestinationBase", () => {
	test("should build s3 destination by default", () => {
		expect(
			getRcloneDestinationBase({
				provider: "AWS",
				bucket: "my-bucket",
			} as never),
		).toBe(":s3:my-bucket");
	});

	test("should build ftp destination", () => {
		expect(
			getRcloneDestinationBase({
				provider: "FTP",
				bucket: "/backups",
			} as never),
		).toBe(":ftp:/backups");
	});

	test("should build sftp destination", () => {
		expect(
			getRcloneDestinationBase({
				provider: "SFTP",
				bucket: "/backups",
			} as never),
		).toBe(":sftp:/backups");
	});
});

describe("getS3Credentials", () => {
	test("should return ftp flags for ftp provider", () => {
		const flags = getS3Credentials({
			provider: "FTP",
			endpoint: "ftp.example.com",
			accessKey: "user",
			secretAccessKey: "pass",
		} as never);

		expect(flags).toContain('--ftp-host="ftp.example.com"');
		expect(flags).toContain('--ftp-user="user"');
		expect(flags).toContain('--ftp-pass="pass"');
	});

	test("should return sftp flags for sftp provider", () => {
		const flags = getS3Credentials({
			provider: "SFTP",
			endpoint: "sftp.example.com:2222",
			accessKey: "user",
			secretAccessKey: "pass",
		} as never);

		expect(flags).toContain('--sftp-host="sftp.example.com"');
		expect(flags).toContain('--sftp-user="user"');
		expect(flags).toContain('--sftp-pass="pass"');
		expect(flags).toContain('--sftp-port="2222"');
	});
});
