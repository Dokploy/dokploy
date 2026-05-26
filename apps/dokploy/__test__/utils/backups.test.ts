import {
	buildRcloneDestination,
	getDestinationRoot,
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

describe("buildRcloneDestination", () => {
	test("should append relative paths to remote roots", () => {
		expect(buildRcloneDestination(":s3:bucket", "app/file.tar.gz")).toBe(
			":s3:bucket/app/file.tar.gz",
		);
		expect(
			buildRcloneDestination(":sftp,host=example.com:backups", "app"),
		).toBe(":sftp,host=example.com:backups/app");
		expect(buildRcloneDestination("remote/root/", "app")).toBe(
			"remote/root/app",
		);
	});

	test("should preserve bare roots when no path is provided", () => {
		expect(buildRcloneDestination(":s3:bucket", "")).toBe(":s3:bucket");
		expect(buildRcloneDestination("remote/root", "")).toBe("remote/root");
	});
});

describe("custom destination helpers", () => {
	const customDestination = {
		provider: "Custom",
		bucket: "backups",
		endpoint: ":sftp,host=example.com:backups",
		additionalFlags: ["--ssh-no-check-known-hosts"],
		accessKey: "",
		secretAccessKey: "",
		region: "",
	};

	test("should use the endpoint as the destination root for custom remotes", () => {
		expect(getDestinationRoot(customDestination)).toBe(
			":sftp,host=example.com:backups",
		);
	});

	test("should only return additional flags for custom destinations", () => {
		expect(getS3Credentials(customDestination)).toEqual([
			"--ssh-no-check-known-hosts",
		]);
	});
});
