import {
	getRcloneDestinationPath,
	getRcloneFlags,
	normalizeS3Path,
} from "@dokploy/server";
import { describe, expect, test } from "vitest";

type PartialDestination = Parameters<typeof getRcloneFlags>[0];

const s3Destination: PartialDestination = {
	destinationId: "1",
	name: "test",
	accessKey: "AKID",
	secretAccessKey: "SECRET",
	bucket: "my-bucket",
	region: "us-east-1",
	endpoint: "https://s3.amazonaws.com",
	provider: "AWS",
	destinationType: "s3",
	host: null,
	port: null,
	username: null,
	password: null,
	organizationId: "org1",
	createdAt: new Date().toISOString(),
} as unknown as PartialDestination;

const sftpDestination: PartialDestination = {
	destinationId: "2",
	name: "sftp-test",
	destinationType: "sftp",
	host: "sftp.example.com",
	port: "2222",
	username: "backupuser",
	password: "s3cr3t",
	bucket: "backups",
	accessKey: null,
	secretAccessKey: null,
	region: null,
	endpoint: null,
	provider: null,
	organizationId: "org1",
	createdAt: new Date().toISOString(),
} as unknown as PartialDestination;

const ftpDestination: PartialDestination = {
	destinationId: "3",
	name: "ftp-test",
	destinationType: "ftp",
	host: "ftp.example.com",
	port: null,
	username: "ftpuser",
	password: "ftppass",
	bucket: "/remote/path",
	accessKey: null,
	secretAccessKey: null,
	region: null,
	endpoint: null,
	provider: null,
	organizationId: "org1",
	createdAt: new Date().toISOString(),
} as unknown as PartialDestination;

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

describe("getRcloneFlags", () => {
	test("returns S3 flags for s3 destination", () => {
		const flags = getRcloneFlags(s3Destination);
		expect(flags).toContain('--s3-provider="AWS"');
		expect(flags).toContain('--s3-access-key-id="AKID"');
		expect(flags).toContain('--s3-secret-access-key="SECRET"');
		expect(flags).toContain('--s3-region="us-east-1"');
		expect(flags).toContain('--s3-endpoint="https://s3.amazonaws.com"');
		expect(flags).toContain("--s3-no-check-bucket");
		expect(flags).toContain("--s3-force-path-style");
	});

	test("returns SFTP flags for sftp destination", () => {
		const flags = getRcloneFlags(sftpDestination);
		expect(flags).toContain('--sftp-host="sftp.example.com"');
		expect(flags).toContain('--sftp-user="backupuser"');
		expect(flags).toContain('--sftp-port="2222"');
		// password must be wrapped in rclone obscure shell substitution
		expect(flags).toContain("--sftp-pass=\"$(rclone obscure 's3cr3t')\"");
		// S3 flags must not be present
		expect(flags.join(" ")).not.toContain("--s3-");
	});

	test("uses default port 22 for SFTP when port is null", () => {
		const dest = {
			...sftpDestination,
			port: null,
		} as unknown as PartialDestination;
		const flags = getRcloneFlags(dest);
		expect(flags).toContain('--sftp-port="22"');
	});

	test("uses default port 22 for SFTP when port is empty string", () => {
		const dest = {
			...sftpDestination,
			port: "",
		} as unknown as PartialDestination;
		const flags = getRcloneFlags(dest);
		expect(flags).toContain('--sftp-port="22"');
	});

	test("uses default port 21 for FTP when port is empty string", () => {
		const dest = {
			...ftpDestination,
			port: "",
		} as unknown as PartialDestination;
		const flags = getRcloneFlags(dest);
		expect(flags).toContain('--ftp-port="21"');
		expect(flags).toContain("--ftp-disable-epsv");
	});

	test("returns FTP flags for ftp destination", () => {
		const flags = getRcloneFlags(ftpDestination);
		expect(flags).toContain('--ftp-host="ftp.example.com"');
		expect(flags).toContain('--ftp-user="ftpuser"');
		expect(flags).toContain('--ftp-port="21"');
		expect(flags).toContain("--ftp-disable-epsv");
		// password must be wrapped in rclone obscure shell substitution
		expect(flags).toContain("--ftp-pass=\"$(rclone obscure 'ftppass')\"");
		expect(flags.join(" ")).not.toContain("--s3-");
	});

	test("escapes single quotes in SFTP/FTP password for shell safety", () => {
		const dest = {
			...sftpDestination,
			password: "pass'with'quotes",
		} as unknown as PartialDestination;
		const flags = getRcloneFlags(dest);
		const passFlag = flags.find((f) => f.startsWith("--sftp-pass="));
		// Single quotes are escaped via the '\'' shell idiom inside rclone obscure '...'
		expect(passFlag).toBe(
			"--sftp-pass=\"$(rclone obscure 'pass'\\''with'\\''quotes')\"",
		);
	});

	test("defaults to S3 when destinationType is null", () => {
		const dest = {
			...s3Destination,
			destinationType: null,
		} as unknown as PartialDestination;
		const flags = getRcloneFlags(dest);
		expect(flags.join(" ")).toContain("--s3-access-key-id");
	});

	test("escapes shell special characters in values", () => {
		const dest = {
			...s3Destination,
			accessKey: 'KEY"WITH"QUOTES',
		} as unknown as PartialDestination;
		const flags = getRcloneFlags(dest);
		const akFlag = flags.find((f) => f.startsWith("--s3-access-key-id="));
		expect(akFlag).toBe('--s3-access-key-id="KEY\\"WITH\\"QUOTES"');
	});
});

describe("getRcloneDestinationPath", () => {
	test("builds S3 path", () => {
		const path = getRcloneDestinationPath(s3Destination, "app/prefix/file.gz");
		expect(path).toBe(":s3:my-bucket/app/prefix/file.gz");
	});

	test("builds SFTP path", () => {
		const path = getRcloneDestinationPath(
			sftpDestination,
			"app/prefix/file.sql.gz",
		);
		expect(path).toBe(":sftp:backups/app/prefix/file.sql.gz");
	});

	test("strips leading slashes from bucket/remotePath for SFTP", () => {
		const dest = {
			...sftpDestination,
			bucket: "/backups",
		} as unknown as PartialDestination;
		const path = getRcloneDestinationPath(dest, "app/file.gz");
		expect(path).toBe(":sftp:backups/app/file.gz");
	});

	test("builds FTP path", () => {
		const path = getRcloneDestinationPath(
			ftpDestination,
			"app/prefix/file.sql.gz",
		);
		expect(path).toBe(":ftp:remote/path/app/prefix/file.sql.gz");
	});
});
