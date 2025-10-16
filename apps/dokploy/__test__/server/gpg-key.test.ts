import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { gpgKeyCreate } from "@dokploy/server/db/validations";

const VALID_PUBLIC_KEY = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQGNBGcGfpMBDADGkL7qvL0kZ1234567890abcdef
-----END PGP PUBLIC KEY BLOCK-----`;

const VALID_PRIVATE_KEY = `-----BEGIN PGP PRIVATE KEY BLOCK-----

lQWGBGcGfpMBDADGkL7qvL0kZ1234567890abcdef
-----END PGP PRIVATE KEY BLOCK-----`;

// Mock encryption utilities
const { encryptSecretMock, decryptSecretMock } = vi.hoisted(() => ({
	encryptSecretMock: vi.fn(async (data: string) => `encrypted_${data}`),
	decryptSecretMock: vi.fn(async (data: string) =>
		data.replace("encrypted_", ""),
	),
}));

vi.mock("@dokploy/server/utils/encryption/secrets", () => ({
	encryptSecret: encryptSecretMock,
	decryptSecret: decryptSecretMock,
}));

// Mock database
const mockDb = {
	insert: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
	query: {
		gpgKeys: {
			findFirst: vi.fn(),
		},
	},
};

vi.mock("@dokploy/server/db", () => ({
	db: mockDb,
}));

// Import services after mocks are set up
let createGpgKey: (
	input: z.infer<typeof gpgKeyCreate> & { organizationId: string },
) => Promise<unknown>;
let updateGpgKeyById: (input: {
	gpgKeyId: string;
	name?: string;
	description?: string;
	publicKey?: string;
	privateKey?: string;
	passphrase?: string;
}) => Promise<unknown>;
let removeGpgKeyById: (gpgKeyId: string) => Promise<unknown>;
let findGpgKeyById: (gpgKeyId: string) => Promise<unknown>;

describe("GPG Key Service", () => {
	beforeEach(async () => {
		vi.clearAllMocks();

		// Reset mock implementations
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						gpgKeyId: "test-key-id",
						name: "Test Key",
						description: "Test Description",
						publicKey: VALID_PUBLIC_KEY,
						privateKey: "encrypted_private_key",
						passphrase: "encrypted_passphrase",
						createdAt: new Date().toISOString(),
						organizationId: "org-123",
					},
				]),
			}),
		});

		mockDb.update.mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							gpgKeyId: "test-key-id",
							name: "Updated Key",
							publicKey: VALID_PUBLIC_KEY,
							organizationId: "org-123",
						},
					]),
				}),
			}),
		});

		mockDb.delete.mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						gpgKeyId: "test-key-id",
					},
				]),
			}),
		});

		mockDb.query.gpgKeys.findFirst.mockResolvedValue({
			gpgKeyId: "test-key-id",
			name: "Test Key",
			description: "Test Description",
			publicKey: VALID_PUBLIC_KEY,
			privateKey: "encrypted_private_key",
			passphrase: "encrypted_passphrase",
			createdAt: new Date().toISOString(),
			organizationId: "org-123",
		});

		// Dynamically import after mocks are set up
		const gpgKeyModule = await import("@dokploy/server/services/gpg-key");
		createGpgKey = gpgKeyModule.createGpgKey;
		updateGpgKeyById = gpgKeyModule.updateGpgKeyById;
		removeGpgKeyById = gpgKeyModule.removeGpgKeyById;
		findGpgKeyById = gpgKeyModule.findGpgKeyById;
	});

	describe("createGpgKey", () => {
		it("should create a GPG key with only public key", async () => {
			const input = {
				name: "Test Public Key",
				description: "Only public key",
				publicKey: VALID_PUBLIC_KEY,
				organizationId: "org-123",
			};

			const result = await createGpgKey(input);

			expect(mockDb.insert).toHaveBeenCalled();
			expect(result).toHaveProperty("gpgKeyId");
			expect(result).toHaveProperty("name", "Test Key");
			expect(encryptSecretMock).not.toHaveBeenCalled(); // No private key to encrypt
		});

		it("should create a GPG key with public and private keys", async () => {
			const input = {
				name: "Test Full Key",
				description: "Full keypair",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: VALID_PRIVATE_KEY,
				organizationId: "org-123",
			};

			await createGpgKey(input);

			expect(encryptSecretMock).toHaveBeenCalledWith(VALID_PRIVATE_KEY);
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it("should encrypt private key and passphrase before storing", async () => {
			const input = {
				name: "Test Encrypted Key",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: VALID_PRIVATE_KEY,
				passphrase: "my-secret-passphrase",
				organizationId: "org-123",
			};

			await createGpgKey(input);

			expect(encryptSecretMock).toHaveBeenCalledWith(VALID_PRIVATE_KEY);
			expect(encryptSecretMock).toHaveBeenCalledWith("my-secret-passphrase");
			expect(encryptSecretMock).toHaveBeenCalledTimes(2);
		});

		it("should handle empty strings for optional fields", async () => {
			const input = {
				name: "Test Key",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: "",
				passphrase: "",
				organizationId: "org-123",
			};

			await createGpgKey(input);

			// Empty strings should not trigger encryption
			expect(mockDb.insert).toHaveBeenCalled();
		});
	});

	describe("updateGpgKeyById", () => {
		it("should update GPG key name and description", async () => {
			const input = {
				gpgKeyId: "test-key-id",
				name: "Updated Name",
				description: "Updated Description",
			};

			const result = await updateGpgKeyById(input);

			expect(mockDb.update).toHaveBeenCalled();
			expect(result).toHaveProperty("name", "Updated Key");
		});

		it("should encrypt private key when updating", async () => {
			const input = {
				gpgKeyId: "test-key-id",
				privateKey: VALID_PRIVATE_KEY,
			};

			await updateGpgKeyById(input);

			expect(encryptSecretMock).toHaveBeenCalledWith(VALID_PRIVATE_KEY);
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("should encrypt passphrase when updating", async () => {
			const input = {
				gpgKeyId: "test-key-id",
				passphrase: "new-passphrase",
			};

			await updateGpgKeyById(input);

			expect(encryptSecretMock).toHaveBeenCalledWith("new-passphrase");
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("should handle partial updates", async () => {
			const input = {
				gpgKeyId: "test-key-id",
				name: "New Name Only",
			};

			await updateGpgKeyById(input);

			expect(encryptSecretMock).not.toHaveBeenCalled();
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("should throw error when GPG key not found", async () => {
			mockDb.update.mockReturnValueOnce({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			});

			const input = {
				gpgKeyId: "non-existent-key",
				name: "Test",
			};

			await expect(updateGpgKeyById(input)).rejects.toThrow(
				"Error updating the GPG key",
			);
		});
	});

	describe("findGpgKeyById", () => {
		it("should find and decrypt GPG key", async () => {
			const result = await findGpgKeyById("test-key-id");

			expect(mockDb.query.gpgKeys.findFirst).toHaveBeenCalled();
			expect(decryptSecretMock).toHaveBeenCalledWith("encrypted_private_key");
			expect(decryptSecretMock).toHaveBeenCalledWith("encrypted_passphrase");
			expect(result).toHaveProperty("privateKey", "private_key");
			expect(result).toHaveProperty("passphrase", "passphrase");
		});

		it("should handle GPG key without private key", async () => {
			mockDb.query.gpgKeys.findFirst.mockResolvedValueOnce({
				gpgKeyId: "test-key-id",
				name: "Public Only Key",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: null,
				passphrase: null,
				organizationId: "org-123",
			});

			const result = await findGpgKeyById("test-key-id");

			expect(decryptSecretMock).not.toHaveBeenCalled();
			expect(result).toHaveProperty("privateKey", null);
			expect(result).toHaveProperty("passphrase", null);
		});

		it("should throw error when GPG key not found", async () => {
			mockDb.query.gpgKeys.findFirst.mockResolvedValueOnce(undefined);

			await expect(findGpgKeyById("non-existent-key")).rejects.toThrow(
				"GPG key not found",
			);
		});
	});

	describe("removeGpgKeyById", () => {
		it("should remove GPG key by ID", async () => {
			const result = await removeGpgKeyById("test-key-id");

			expect(mockDb.delete).toHaveBeenCalled();
			expect(result).toHaveProperty("gpgKeyId", "test-key-id");
		});

		it("should return undefined when key does not exist", async () => {
			mockDb.delete.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			});

			const result = await removeGpgKeyById("non-existent-key");

			expect(result).toBeUndefined();
		});
	});
});

