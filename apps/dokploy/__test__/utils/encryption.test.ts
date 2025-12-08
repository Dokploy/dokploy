import type { Destination } from "@dokploy/server/services/destination";
import {
	type EncryptionConfig,
	getEncryptionConfigFromDestination,
	getRcloneS3Remote,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

// Mock destination factory for testing
const createMockDestination = (
	overrides: Partial<Destination> = {},
): Destination => ({
	destinationId: "test-dest-id",
	name: "Test Destination",
	provider: "aws",
	accessKey: "AKIAIOSFODNN7EXAMPLE",
	secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	bucket: "my-backup-bucket",
	region: "us-east-1",
	endpoint: "https://s3.amazonaws.com",
	organizationId: "org-123",
	createdAt: new Date(),
	encryptionEnabled: false,
	encryptionKey: null,
	encryptionPassword2: null,
	filenameEncryption: "off",
	directoryNameEncryption: false,
	...overrides,
});

describe("getEncryptionConfigFromDestination", () => {
	test("should return disabled config when encryption is not enabled", () => {
		const destination = createMockDestination({
			encryptionEnabled: false,
			encryptionKey: null,
		});

		const config = getEncryptionConfigFromDestination(destination);

		expect(config.enabled).toBe(false);
		expect(config.key).toBeNull();
		expect(config.password2).toBeNull();
		expect(config.filenameEncryption).toBe("off");
		expect(config.directoryNameEncryption).toBe(false);
	});

	test("should return enabled config with all encryption options", () => {
		const destination = createMockDestination({
			encryptionEnabled: true,
			encryptionKey: "my-secret-encryption-key",
			encryptionPassword2: "my-salt-password",
			filenameEncryption: "standard",
			directoryNameEncryption: true,
		});

		const config = getEncryptionConfigFromDestination(destination);

		expect(config.enabled).toBe(true);
		expect(config.key).toBe("my-secret-encryption-key");
		expect(config.password2).toBe("my-salt-password");
		expect(config.filenameEncryption).toBe("standard");
		expect(config.directoryNameEncryption).toBe(true);
	});

	test("should handle obfuscate filename encryption", () => {
		const destination = createMockDestination({
			encryptionEnabled: true,
			encryptionKey: "my-key",
			filenameEncryption: "obfuscate",
		});

		const config = getEncryptionConfigFromDestination(destination);

		expect(config.filenameEncryption).toBe("obfuscate");
	});

	test("should handle null/undefined values with defaults", () => {
		const destination = createMockDestination({
			encryptionEnabled: true,
			encryptionKey: "my-key",
			encryptionPassword2: null,
			filenameEncryption: null as unknown as string,
			directoryNameEncryption: null as unknown as boolean,
		});

		const config = getEncryptionConfigFromDestination(destination);

		expect(config.password2).toBeNull();
		expect(config.filenameEncryption).toBe("off");
		expect(config.directoryNameEncryption).toBe(false);
	});

	test("should handle undefined encryptionEnabled as false", () => {
		const destination = createMockDestination();
		// @ts-expect-error Testing undefined value
		destination.encryptionEnabled = undefined;

		const config = getEncryptionConfigFromDestination(destination);

		expect(config.enabled).toBe(false);
	});
});

describe("getRcloneS3Remote", () => {
	describe("without encryption", () => {
		test("should return basic S3 remote without provider", () => {
			const destination = createMockDestination({
				provider: null,
			});

			const result = getRcloneS3Remote(destination);

			expect(result.envVars).toBe("");
			expect(result.remote).toContain(":s3,");
			expect(result.remote).toContain(
				`access_key_id="${destination.accessKey}"`,
			);
			expect(result.remote).toContain(
				`secret_access_key="${destination.secretAccessKey}"`,
			);
			expect(result.remote).toContain(`region="${destination.region}"`);
			expect(result.remote).toContain(`endpoint="${destination.endpoint}"`);
			expect(result.remote).toContain("no_check_bucket=true");
			expect(result.remote).toContain("force_path_style=true");
			expect(result.remote).toContain(`:${destination.bucket}`);
			expect(result.remote).not.toContain("provider=");
		});

		test("should return S3 remote with provider when specified", () => {
			const destination = createMockDestination({
				provider: "aws",
			});

			const result = getRcloneS3Remote(destination);

			expect(result.envVars).toBe("");
			expect(result.remote).toContain(`provider="${destination.provider}"`);
		});

		test("should return S3 remote when encryption config is disabled", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: false,
				key: "some-key",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.envVars).toBe("");
			expect(result.remote).not.toContain(":crypt,");
		});

		test("should return S3 remote when encryption enabled but no key", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: null,
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.envVars).toBe("");
			expect(result.remote).not.toContain(":crypt,");
		});
	});

	describe("with encryption", () => {
		test("should return crypt-wrapped remote with basic encryption", () => {
			const destination = createMockDestination({
				provider: "aws",
			});
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-encryption-key",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain(":crypt,");
			expect(result.remote).toContain("filename_encryption=off");
			expect(result.remote).toContain("directory_name_encryption=false");
			expect(result.envVars).toBe("RCLONE_CRYPT_PASSWORD='my-encryption-key'");
		});

		test("should include password2 when provided", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-encryption-key",
				password2: "my-salt-password",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.envVars).toContain(
				"RCLONE_CRYPT_PASSWORD='my-encryption-key'",
			);
			expect(result.envVars).toContain(
				"RCLONE_CRYPT_PASSWORD2='my-salt-password'",
			);
		});

		test("should handle standard filename encryption", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				filenameEncryption: "standard",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain("filename_encryption=standard");
		});

		test("should handle obfuscate filename encryption", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				filenameEncryption: "obfuscate",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain("filename_encryption=obfuscate");
		});

		test("should handle directory name encryption", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				directoryNameEncryption: true,
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain("directory_name_encryption=true");
		});

		test("should handle all encryption options together", () => {
			const destination = createMockDestination({
				provider: "aws",
			});
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "encryption-key",
				password2: "salt-password",
				filenameEncryption: "standard",
				directoryNameEncryption: true,
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain(":crypt,");
			expect(result.remote).toContain("filename_encryption=standard");
			expect(result.remote).toContain("directory_name_encryption=true");
			expect(result.envVars).toContain(
				"RCLONE_CRYPT_PASSWORD='encryption-key'",
			);
			expect(result.envVars).toContain(
				"RCLONE_CRYPT_PASSWORD2='salt-password'",
			);
		});

		test("should escape single quotes in encryption key", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "key'with'quotes",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.envVars).toContain("key'\\''with'\\''quotes");
		});

		test("should escape single quotes in password2", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				password2: "salt'with'quotes",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.envVars).toContain(
				"RCLONE_CRYPT_PASSWORD2='salt'\\''with'\\''quotes'",
			);
		});

		test("should wrap S3 remote correctly in crypt remote", () => {
			const destination = createMockDestination({
				bucket: "test-bucket",
				provider: "aws",
			});
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			// The crypt remote should contain the S3 remote and bucket
			expect(result.remote).toMatch(/:crypt,remote=":s3,.*:test-bucket",/);
			// Should end with a colon for the path
			expect(result.remote).toMatch(/:$/);
		});
	});

	describe("edge cases", () => {
		test("should handle special characters in access keys", () => {
			const destination = createMockDestination({
				accessKey: "AKIA+/=EXAMPLE",
				secretAccessKey: "secret+/=key",
			});

			const result = getRcloneS3Remote(destination);

			expect(result.remote).toContain(
				`access_key_id="${destination.accessKey}"`,
			);
			expect(result.remote).toContain(
				`secret_access_key="${destination.secretAccessKey}"`,
			);
		});

		test("should handle custom endpoints", () => {
			const destination = createMockDestination({
				endpoint: "https://s3.custom-region.example.com:9000",
				provider: "minio",
			});

			const result = getRcloneS3Remote(destination);

			expect(result.remote).toContain(`endpoint="${destination.endpoint}"`);
			expect(result.remote).toContain(`provider="${destination.provider}"`);
		});

		test("should handle empty password2", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				password2: "",
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			// Empty string is falsy, so password2 should not be included
			expect(result.envVars).toBe("RCLONE_CRYPT_PASSWORD='my-key'");
			expect(result.envVars).not.toContain("RCLONE_CRYPT_PASSWORD2");
		});

		test("should handle undefined encryptionConfig", () => {
			const destination = createMockDestination();

			const result = getRcloneS3Remote(destination, undefined);

			expect(result.envVars).toBe("");
			expect(result.remote).not.toContain(":crypt,");
		});

		test("should handle null filenameEncryption with default", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				filenameEncryption: null,
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain("filename_encryption=off");
		});

		test("should handle null directoryNameEncryption with default", () => {
			const destination = createMockDestination();
			const encryptionConfig: EncryptionConfig = {
				enabled: true,
				key: "my-key",
				directoryNameEncryption: null,
			};

			const result = getRcloneS3Remote(destination, encryptionConfig);

			expect(result.remote).toContain("directory_name_encryption=false");
		});
	});
});
