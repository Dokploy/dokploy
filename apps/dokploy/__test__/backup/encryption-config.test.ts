import { describe, expect, it } from "vitest";
import {
	buildRcloneCommand,
	getBackupRemotePath,
	getRcloneS3Remote,
} from "@dokploy/server/utils/backups/utils";
import type { Destination } from "@dokploy/server/services/destination";

const createDestination = (
	overrides: Partial<Destination> = {},
): Destination => ({
	destinationId: "dest-1",
	name: "Encrypted bucket",
	provider: "",
	accessKey: "ACCESS_KEY",
	secretAccessKey: "SECRET_KEY",
	bucket: "my-bucket",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	organizationId: "org-1",
	createdAt: new Date("2024-01-01T00:00:00Z"),
	encryptionEnabled: false,
	encryptionKey: null,
	encryptionPassword2: null,
	filenameEncryption: "off",
	directoryNameEncryption: false,
	...overrides,
});

describe("rclone encryption helpers", () => {
	it("builds a plain S3 remote without encryption", () => {
		const destination = createDestination();

		const { remote, envVars } = getRcloneS3Remote(destination);

		expect(envVars).toBe("");
		expect(remote).toContain(":s3,");
		expect(remote).toContain("my-bucket");
	});

	it("builds a crypt remote and env vars when encryption is enabled", () => {
		const destination = createDestination({
			encryptionEnabled: true,
			encryptionKey: "primary-pass",
			encryptionPassword2: "salt-pass",
			filenameEncryption: "standard",
			directoryNameEncryption: true,
		});

		const { remote, envVars } = getRcloneS3Remote(destination);

		expect(remote.startsWith(":crypt")).toBe(true);
		expect(remote).toContain('remote=":s3,');
		expect(remote.endsWith(":")).toBe(true);
		expect(envVars).toContain("RCLONE_CRYPT_PASSWORD='primary-pass'");
		expect(envVars).toContain("RCLONE_CRYPT_PASSWORD2='salt-pass'");
	});

	it("returns the correct remote path for nested prefixes", () => {
		const destination = createDestination();
		const { remote } = getRcloneS3Remote(destination);

		const remotePath = getBackupRemotePath(remote, "daily/db");

		expect(remotePath).toBe(`${remote}/daily/db/`);
	});

	it("adds encryption env vars to commands only when provided", () => {
		expect(buildRcloneCommand("rclone lsf remote")).toBe("rclone lsf remote");

		expect(
			buildRcloneCommand("rclone lsf remote", "RCLONE_CRYPT_PASSWORD='secret'"),
		).toBe("RCLONE_CRYPT_PASSWORD='secret' rclone lsf remote");
	});
});
