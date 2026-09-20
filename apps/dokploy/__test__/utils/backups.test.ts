import {
	isNonS3DestinationProvider,
	parseRcloneConfig,
	validateRcloneDestinationConfig,
} from "@dokploy/server/db/validations/destination";
import {
	getRcloneBackendType,
	getRcloneFlags,
	getRcloneRemotePath,
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

type RcloneDestinationInput = Parameters<typeof getRcloneFlags>[0];

const makeDestination = (
	overrides: Partial<RcloneDestinationInput>,
): RcloneDestinationInput => ({
	name: "test-destination",
	provider: "aws",
	bucket: "dokploy-bucket",
	rcloneConfig: null,
	accessKey: "AKIAIOSFODNN7EXAMPLE",
	secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	additionalFlags: null,
	...overrides,
});

describe("getRcloneBackendType", () => {
	test("returns s3 for s3 providers and missing provider", () => {
		expect(getRcloneBackendType(makeDestination({ provider: "aws" }))).toBe(
			"s3",
		);
		expect(
			getRcloneBackendType(makeDestination({ provider: "cloudflare" })),
		).toBe("s3");
		expect(getRcloneBackendType(makeDestination({ provider: null }))).toBe(
			"s3",
		);
		expect(getRcloneBackendType(makeDestination({ provider: "" }))).toBe("s3");
	});

	test("returns the backend for preset non-s3 providers", () => {
		for (const provider of ["ftp", "sftp", "drive", "onedrive"]) {
			expect(getRcloneBackendType(makeDestination({ provider }))).toBe(
				provider,
			);
		}
	});

	test("resolves custom backend from the rclone config type", () => {
		expect(
			getRcloneBackendType(
				makeDestination({
					provider: "custom",
					rcloneConfig: "type = dropbox\nclient_id = abc",
				}),
			),
		).toBe("dropbox");
	});

	test("throws for custom provider without a valid type", () => {
		expect(() =>
			getRcloneBackendType(
				makeDestination({ provider: "custom", rcloneConfig: "token = abc" }),
			),
		).toThrow("Invalid rclone backend type");
		expect(() =>
			getRcloneBackendType(
				makeDestination({ provider: "custom", rcloneConfig: null }),
			),
		).toThrow("Invalid rclone backend type");
	});
});

describe("getRcloneRemotePath", () => {
	test("produces identical remotes for s3 destinations", () => {
		expect(getRcloneRemotePath(makeDestination({}))).toBe(":s3:dokploy-bucket");
		expect(getRcloneRemotePath(makeDestination({}), "prefix/backup.dump")).toBe(
			":s3:dokploy-bucket/prefix/backup.dump",
		);
	});

	test("keeps the remote home-relative when the root path is empty", () => {
		expect(
			getRcloneRemotePath(
				makeDestination({
					provider: "sftp",
					bucket: "",
					rcloneConfig: "host = sftp.example.com",
				}),
				"backups/file.dump",
			),
		).toBe(":sftp:backups/file.dump");
	});

	test("uses an absolute remote root when the path starts with /", () => {
		expect(
			getRcloneRemotePath(
				makeDestination({
					provider: "sftp",
					bucket: "/backups",
					rcloneConfig: "host = sftp.example.com",
				}),
				"file.dump",
			),
		).toBe(":sftp:/backups/file.dump");
	});

	test("strips trailing slashes on the non-s3 remote root", () => {
		expect(
			getRcloneRemotePath(
				makeDestination({
					provider: "ftp",
					bucket: "backups//",
					rcloneConfig: "host = ftp.example.com",
				}),
				"file.dump",
			),
		).toBe(":ftp:backups/file.dump");
	});

	test("supports custom backends", () => {
		expect(
			getRcloneRemotePath(
				makeDestination({
					provider: "custom",
					bucket: "base/dir",
					rcloneConfig: "type = dropbox\ntoken = t",
				}),
				"file.dump",
			),
		).toBe(":dropbox:base/dir/file.dump");
	});

	test("returns the bare remote for an empty path", () => {
		expect(
			getRcloneRemotePath(
				makeDestination({
					provider: "drive",
					bucket: "backups",
					rcloneConfig: "token = t",
				}),
			),
		).toBe(":drive:backups");
	});
});

describe("getRcloneFlags", () => {
	test("delegates s3 destinations to getS3Credentials", () => {
		const destination = makeDestination({});
		expect(getRcloneFlags(destination)).toEqual(getS3Credentials(destination));
	});

	test("maps config entries to backend flags", () => {
		expect(
			getRcloneFlags(
				makeDestination({
					provider: "sftp",
					rcloneConfig:
						"host = sftp.example.com\nport = 22\nuser = bob\npass = s3cret\nkey_file = /keys/id",
				}),
			),
		).toEqual([
			"--sftp-host=sftp.example.com",
			"--sftp-port=22",
			"--sftp-user=bob",
			"--sftp-pass=s3cret",
			"--sftp-key-file=/keys/id",
		]);
	});

	test("shell-quotes config values that need it", () => {
		expect(
			getRcloneFlags(
				makeDestination({
					provider: "ftp",
					rcloneConfig: 'host = h\npass = "my secret"',
				}),
			),
		).toContain("--ftp-pass='\"my secret\"'");
	});

	test("excludes the type key from flags", () => {
		expect(
			getRcloneFlags(
				makeDestination({
					provider: "custom",
					rcloneConfig: "type = dropbox\ntoken = t",
				}),
			),
		).toEqual(["--dropbox-token=t"]);
	});

	test("appends additionalFlags", () => {
		expect(
			getRcloneFlags(
				makeDestination({
					provider: "ftp",
					rcloneConfig: "host = h",
					additionalFlags: ["--ftp-tls"],
				}),
			),
		).toContain("--ftp-tls");
	});

	test("throws on invalid config", () => {
		expect(() =>
			getRcloneFlags(
				makeDestination({ provider: "ftp", rcloneConfig: "garbage" }),
			),
		).toThrow("Invalid rclone config");
	});

	test("builds s3 flags from rcloneConfig for custom s3 destinations", () => {
		const destination = makeDestination({
			provider: "custom",
			accessKey: "",
			secretAccessKey: "",
			region: "",
			endpoint: "",
			rcloneConfig:
				"type = s3\naccess_key_id = AKIA\nsecret_access_key = shh\nendpoint = https://minio.local",
		});
		expect(getRcloneFlags(destination)).toEqual([
			"--s3-access-key-id=AKIA",
			"--s3-secret-access-key=shh",
			"--s3-endpoint=https\\://minio.local",
		]);
		expect(getRcloneRemotePath(destination, "file.dump")).toBe(
			":s3:dokploy-bucket/file.dump",
		);
	});
});

describe("isNonS3DestinationProvider", () => {
	test("matches the rclone presets and custom", () => {
		for (const provider of ["ftp", "sftp", "drive", "onedrive", "custom"]) {
			expect(isNonS3DestinationProvider(provider)).toBe(true);
		}
		expect(isNonS3DestinationProvider("SFTP")).toBe(true);
		expect(isNonS3DestinationProvider(" ftp ")).toBe(true);
	});

	test("rejects s3 and empty providers", () => {
		for (const provider of ["aws", "cloudflare", "", null, undefined]) {
			expect(isNonS3DestinationProvider(provider)).toBe(false);
		}
	});
});

describe("parseRcloneConfig", () => {
	test("parses key = value lines", () => {
		const { config, error } = parseRcloneConfig("host = h\npass = p");
		expect(error).toBeNull();
		expect(config).toEqual({ host: "h", pass: "p" });
	});

	test("skips comments, blank lines and a single section header", () => {
		const { config, error } = parseRcloneConfig(
			"# comment\n; another\n[myremote]\nhost = h\n\n",
		);
		expect(error).toBeNull();
		expect(config).toEqual({ host: "h" });
	});

	test("rejects a second section header", () => {
		const { error } = parseRcloneConfig("[a]\nhost = h\n[b]\nport = 1");
		expect(error).toContain("single rclone config section");
	});

	test("rejects lines without =", () => {
		expect(parseRcloneConfig("host h").error).toContain(
			"Invalid rclone config line",
		);
	});

	test("rejects invalid keys", () => {
		expect(parseRcloneConfig("my key = v").error).toContain(
			"Invalid rclone option key",
		);
		expect(parseRcloneConfig("key-name = v").error).toContain(
			"Invalid rclone option key",
		);
	});

	test("rejects empty values", () => {
		expect(parseRcloneConfig("host = ").error).toContain("Missing value");
	});

	test("keeps values containing = and quotes intact", () => {
		const { config, error } = parseRcloneConfig(
			'token = {"access_token":"a=b","expiry":"2026-01-01"}',
		);
		expect(error).toBeNull();
		expect(config.token).toBe('{"access_token":"a=b","expiry":"2026-01-01"}');
	});
});

describe("validateRcloneDestinationConfig", () => {
	test("accepts s3 providers without rclone config", () => {
		expect(validateRcloneDestinationConfig("aws", undefined)).toBeNull();
		expect(validateRcloneDestinationConfig(null, undefined)).toBeNull();
	});

	test("requires config for non-s3 providers", () => {
		expect(validateRcloneDestinationConfig("sftp", "  ")).toContain(
			"Rclone config is required",
		);
		expect(validateRcloneDestinationConfig("ftp", undefined)).toContain(
			"Rclone config is required",
		);
	});

	test("accepts preset configs without a type entry", () => {
		expect(
			validateRcloneDestinationConfig("ftp", "host = h\nuser = u"),
		).toBeNull();
	});

	test("accepts a matching type entry for preset providers", () => {
		expect(
			validateRcloneDestinationConfig("ftp", "type = ftp\nhost = h"),
		).toBeNull();
	});

	test("rejects mismatched type entries for preset providers", () => {
		expect(
			validateRcloneDestinationConfig("ftp", "type = sftp\nhost = h"),
		).toContain("does not match");
	});

	test("requires a valid type for custom providers", () => {
		expect(validateRcloneDestinationConfig("custom", "token = t")).toContain(
			"type = <backend>",
		);
		expect(
			validateRcloneDestinationConfig("custom", "type = dropbox\ntoken = t"),
		).toBeNull();
		expect(
			validateRcloneDestinationConfig("custom", "type = not a type"),
		).toContain("type = <backend>");
	});
});
