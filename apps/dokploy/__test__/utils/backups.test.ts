import {
	getRclonePathAndFlags,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test, vi } from "vitest";

vi.mock("node:child_process", () => ({
	exec: (cmd: string, cb: any) => {
		if (cmd.startsWith("rclone obscure")) {
			cb(null, { stdout: "obscured_pass" });
		} else {
			cb(null, { stdout: "" });
		}
	},
}));

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

describe("getRclonePathAndFlags", () => {
	test("should return correct flags and path for S3", async () => {
		const destination = {
			provider: "aws",
			accessKey: "access",
			secretAccessKey: "secret",
			bucket: "mybucket",
			region: "us-east-1",
			endpoint: "https://s3.amazonaws.com",
		};
		const { flags, path } = await getRclonePathAndFlags(
			destination as any,
			"mypath",
		);
		expect(flags).toContain('--s3-access-key-id="access"');
		expect(flags).toContain('--s3-secret-access-key="secret"');
		expect(path).toBe(":s3:mybucket/mypath");
	});

	test("should return correct on-the-fly connection string for SFTP", async () => {
		const destination = {
			provider: "sftp",
			accessKey: "sftpuser",
			secretAccessKey: "sftppass",
			bucket: "sftppath",
			region: "2022",
			endpoint: "sftp.example.com",
		};
		const { flags, path } = await getRclonePathAndFlags(
			destination as any,
			"mypath",
		);
		expect(flags).toEqual([]);
		expect(path).toContain(
			':sftp,host="sftp.example.com",port="2022",user="sftpuser"',
		);
		expect(path).toContain('pass="obscured_pass"');
		expect(path.endsWith(":sftppath/mypath")).toBe(true);
	});

	test("should return correct on-the-fly connection string for FTP", async () => {
		const destination = {
			provider: "ftp",
			accessKey: "ftpuser",
			secretAccessKey: "ftppass",
			bucket: "ftppath",
			region: "21",
			endpoint: "ftp.example.com",
		};
		const { flags, path } = await getRclonePathAndFlags(
			destination as any,
			"mypath",
		);
		expect(flags).toEqual([]);
		expect(path).toContain(
			':ftp,host="ftp.example.com",port="21",user="ftpuser"',
		);
		expect(path).toContain('pass="obscured_pass"');
		expect(path.endsWith(":ftppath/mypath")).toBe(true);
	});
});
