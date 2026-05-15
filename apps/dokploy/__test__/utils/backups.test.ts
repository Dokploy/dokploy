import type { Destination } from "@dokploy/server/services/destination";
import {
	getRcloneBucketPath,
	getS3Credentials,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

const baseDestination = {
	destinationId: "dest-1",
	name: "test",
	provider: "AWS",
	accessKey: "AKIA",
	secretAccessKey: "secret",
	bucket: "my-bucket",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	additionalFlags: null,
	organizationId: "org-1",
	createdAt: new Date(),
} satisfies Destination;

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

describe("getRcloneBucketPath", () => {
	test("returns S3-style remote for S3 providers", () => {
		expect(getRcloneBucketPath(baseDestination)).toBe(":s3:my-bucket");
	});

	test("uses the user-supplied connection string for Custom provider", () => {
		const destination: Destination = {
			...baseDestination,
			provider: "Custom",
			endpoint: ":sftp,host=example.com,user=foo,pass=bar:",
			bucket: "",
			accessKey: "",
			secretAccessKey: "",
			region: "",
		};
		expect(getRcloneBucketPath(destination)).toBe(
			":sftp,host=example.com,user=foo,pass=bar:",
		);
	});

	test("appends the optional path/folder for Custom provider", () => {
		const destination: Destination = {
			...baseDestination,
			provider: "Custom",
			endpoint: ":drive,token=xyz:",
			bucket: "/backups",
			accessKey: "",
			secretAccessKey: "",
			region: "",
		};
		expect(getRcloneBucketPath(destination)).toBe(":drive,token=xyz:backups");
	});
});

describe("getS3Credentials", () => {
	test("emits --s3-* flags for S3 providers", () => {
		const flags = getS3Credentials(baseDestination);
		expect(flags).toContain('--s3-access-key-id="AKIA"');
		expect(flags).toContain('--s3-secret-access-key="secret"');
		expect(flags).toContain('--s3-region="us-east-1"');
		expect(flags).toContain('--s3-endpoint="https://s3.example.com"');
		expect(flags).toContain('--s3-provider="AWS"');
	});

	test("does NOT emit --s3-* flags for Custom provider", () => {
		const destination: Destination = {
			...baseDestination,
			provider: "Custom",
			endpoint: ":sftp,host=example.com,user=foo,pass=bar:",
			additionalFlags: ["--sftp-disable-hashcheck"],
		};
		const flags = getS3Credentials(destination);
		for (const flag of flags) {
			expect(flag).not.toMatch(/^--s3-/);
		}
		expect(flags).toEqual(["--sftp-disable-hashcheck"]);
	});

	test("returns an empty array for Custom provider with no additional flags", () => {
		const destination: Destination = {
			...baseDestination,
			provider: "Custom",
			endpoint: ":sftp,host=example.com,user=foo,pass=bar:",
			additionalFlags: null,
		};
		expect(getS3Credentials(destination)).toEqual([]);
	});
});
