import {
	GENERIC_RCLONE_PROVIDER,
	getRcloneCredentials,
	getRcloneDestination,
	getRcloneTestFlags,
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

describe("rclone destination helpers", () => {
	const s3Destination = {
		provider: "AWS",
		accessKey: "access",
		secretAccessKey: "secret",
		bucket: "dokploy-backups",
		region: "us-east-1",
		endpoint: "https://s3.example.com",
		additionalFlags: ["--s3-no-head"],
	} as const;

	const genericDestination = {
		provider: GENERIC_RCLONE_PROVIDER,
		accessKey: "",
		secretAccessKey: "",
		bucket: "gdrive:backups",
		region: "",
		endpoint: "",
		additionalFlags: ["--drive-root-folder-id=abc123"],
	} as const;

	test("should keep s3 destinations on the s3 remote path", () => {
		expect(getRcloneDestination(s3Destination as never)).toBe(
			":s3:dokploy-backups",
		);
		expect(getRcloneCredentials(s3Destination as never)).toEqual([
			'--s3-provider="AWS"',
			'--s3-access-key-id="access"',
			'--s3-secret-access-key="secret"',
			'--s3-region="us-east-1"',
			'--s3-endpoint="https://s3.example.com"',
			"--s3-no-check-bucket",
			"--s3-force-path-style",
			"--s3-no-head",
		]);
	});

	test("should allow generic rclone remotes", () => {
		expect(getRcloneDestination(genericDestination as never)).toBe(
			"gdrive:backups",
		);
		expect(getRcloneCredentials(genericDestination as never)).toEqual([
			"--drive-root-folder-id=abc123",
		]);
		expect(getRcloneTestFlags(genericDestination as never)).toEqual([
			"--drive-root-folder-id=abc123",
			"--retries 1",
			"--low-level-retries 1",
			"--timeout 10s",
			"--contimeout 5s",
		]);
	});
});
