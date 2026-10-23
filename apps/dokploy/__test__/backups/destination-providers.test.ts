import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import {
	getRcloneBackend,
	getRcloneCredentials,
	getRcloneDestination,
} from "@dokploy/server/utils/backups/utils";
import { quote } from "shell-quote";
import { describe, expect, test } from "vitest";

const baseDestination = {
	provider: "",
	accessKey: "user",
	secretAccessKey: "secret",
	bucket: "dokploy-bucket",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	additionalFlags: null,
};

describe("getRcloneBackend", () => {
	test("maps provider names to rclone backends", () => {
		expect(getRcloneBackend("AWS")).toBe("s3");
		expect(getRcloneBackend("")).toBe("s3");
		expect(getRcloneBackend(undefined)).toBe("s3");
		expect(getRcloneBackend("sftp")).toBe("sftp");
		expect(getRcloneBackend("SFTP")).toBe("sftp");
		expect(getRcloneBackend("ftp")).toBe("ftp");
		expect(getRcloneBackend("webdav")).toBe("webdav");
	});
});

describe("getRcloneDestination", () => {
	test("keeps the legacy s3 format", () => {
		expect(getRcloneDestination({ ...baseDestination })).toBe(
			":s3:dokploy-bucket",
		);
		expect(
			getRcloneDestination({ ...baseDestination }, "app/backups/2026.sql.gz"),
		).toBe(":s3:dokploy-bucket/app/backups/2026.sql.gz");
	});

	test("builds sftp destinations with an absolute path", () => {
		expect(
			getRcloneDestination(
				{ ...baseDestination, provider: "sftp" },
				"app/backups/2026.sql.gz",
			),
		).toBe(":sftp:/dokploy-bucket/app/backups/2026.sql.gz");
		expect(getRcloneDestination({ ...baseDestination, provider: "SFTP" })).toBe(
			":sftp:/dokploy-bucket",
		);
	});

	test("normalizes bucket slashes for non-s3 backends", () => {
		expect(
			getRcloneDestination({
				...baseDestination,
				provider: "sftp",
				bucket: "/backups/",
			}),
		).toBe(":sftp:/backups");
		expect(
			getRcloneDestination({
				...baseDestination,
				provider: "ftp",
				bucket: "backups",
			}),
		).toBe(":ftp:/backups");
		expect(
			getRcloneDestination({
				...baseDestination,
				provider: "webdav",
				bucket: "backups",
			}),
		).toBe(":webdav:/backups");
	});
});

describe("getRcloneCredentials", () => {
	test("returns the legacy s3 flags", () => {
		const flags = getRcloneCredentials({
			...baseDestination,
			provider: "Wasabi",
			additionalFlags: ["--s3-v2-auth"],
		});
		expect(flags).toContain(
			`--s3-endpoint=${quote(["https://s3.example.com"])}`,
		);
		expect(flags[0]).toBe("--s3-provider=Wasabi");
		expect(flags).toContain("--s3-v2-auth");
	});

	test("returns sftp flags and obscures the password", () => {
		const flags = getRcloneCredentials({
			...baseDestination,
			provider: "sftp",
			endpoint: "server.example.com:22",
			region: "2222",
			additionalFlags: ["--sftp-idle-timeout=1h"],
		});
		expect(flags).toContain(`--sftp-host=${quote(["server.example.com:22"])}`);
		expect(flags).toContain(`--sftp-port=${quote(["2222"])}`);
		expect(flags).toContain(
			`--sftp-pass=$(rclone obscure ${quote(["secret"])})`,
		);
		expect(flags).toContain("--sftp-idle-timeout=1h");
	});

	test("omits sftp port and password flags when unset", () => {
		const flags = getRcloneCredentials({
			...baseDestination,
			provider: "ftp",
			region: "",
			secretAccessKey: "",
		});
		expect(flags).toContain(`--ftp-host=${quote(["https://s3.example.com"])}`);
		expect(flags.join(" ")).not.toContain("-port=");
		expect(flags.join(" ")).not.toContain("-pass=");
	});

	test("returns webdav flags using url instead of host", () => {
		const flags = getRcloneCredentials({
			...baseDestination,
			provider: "webdav",
		});
		expect(flags).toContain(
			`--webdav-url=${quote(["https://s3.example.com"])}`,
		);
		expect(flags.join(" ")).not.toContain("--webdav-host");
	});
});

describe("redactRcloneCredentials with new pass flags", () => {
	test("redacts obscured and substituted pass flags", () => {
		const command =
			"rclone rcat --sftp-pass=$(rclone obscure 'supersecret') --ftp-pass=example --webdav-pass=$(rclone obscure \"pw\") :sftp:/bucket";
		const redacted = redactRcloneCredentials(command);
		expect(redacted).not.toContain("supersecret");
		expect(redacted).not.toContain("example");
		expect(redacted).not.toContain("pw");
		expect(redacted).toContain('--sftp-pass="[REDACTED]"');
	});

	test("still redacts s3 credentials", () => {
		const command =
			"rclone rcat --s3-access-key-id='AKIA' --s3-secret-access-key='sk' :s3:bucket";
		const redacted = redactRcloneCredentials(command);
		expect(redacted).not.toContain("AKIA");
		expect(redacted).not.toContain("sk");
	});
});
