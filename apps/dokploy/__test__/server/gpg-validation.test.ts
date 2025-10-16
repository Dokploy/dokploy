import { describe, expect, it } from "vitest";
import { gpgKeyCreate, gpgKeyUpdate } from "@dokploy/server/db/validations";

const VALID_PUBLIC_KEY = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQGNBGcGfpMBDADGkL7qvL0kZ1234567890abcdef
ghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKL
MNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr
stuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXY
Z1234567890abcdefghijklmnopqrstuvwxyz123456
-----END PGP PUBLIC KEY BLOCK-----`;

const VALID_PRIVATE_KEY = `-----BEGIN PGP PRIVATE KEY BLOCK-----

lQWGBGcGfpMBDADGkL7qvL0kZ1234567890abcdef
ghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKL
MNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr
stuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXY
Z1234567890abcdefghijklmnopqrstuvwxyz123456
-----END PGP PRIVATE KEY BLOCK-----`;

describe("GPG Key Validation", () => {
	describe("gpgKeyCreate schema", () => {
		it("should validate a GPG key with only required fields", () => {
			const input = {
				name: "My GPG Key",
				publicKey: VALID_PUBLIC_KEY,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("My GPG Key");
				expect(result.data.publicKey).toContain("BEGIN PGP PUBLIC KEY BLOCK");
			}
		});

		it("should validate a GPG key with all fields", () => {
			const input = {
				name: "Full GPG Key",
				description: "A complete GPG keypair",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: VALID_PRIVATE_KEY,
				passphrase: "my-secret-passphrase",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("Full GPG Key");
				expect(result.data.description).toBe("A complete GPG keypair");
				expect(result.data.privateKey).toContain("BEGIN PGP PRIVATE KEY BLOCK");
				expect(result.data.passphrase).toBe("my-secret-passphrase");
			}
		});

		it("should trim whitespace from public key", () => {
			const input = {
				name: "Trimmed Key",
				publicKey: `   ${VALID_PUBLIC_KEY}   `,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.publicKey).not.toMatch(/^\s+/);
				expect(result.data.publicKey).not.toMatch(/\s+$/);
			}
		});

		it("should trim whitespace from private key", () => {
			const input = {
				name: "Trimmed Private Key",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: `\n\n${VALID_PRIVATE_KEY}\n\n`,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.privateKey).not.toMatch(/^\n+/);
				expect(result.data.privateKey).not.toMatch(/\n+$/);
			}
		});

		it("should reject missing name", () => {
			const input = {
				publicKey: VALID_PUBLIC_KEY,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues).toHaveLength(1);
				expect(result.error.issues[0]?.path).toContain("name");
			}
		});

		it("should reject empty name", () => {
			const input = {
				name: "",
				publicKey: VALID_PUBLIC_KEY,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
		});

		it("should reject missing public key", () => {
			const input = {
				name: "Missing Public Key",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues.some((i) => i.path.includes("publicKey"))).toBe(true);
			}
		});

		it("should reject invalid public key format", () => {
			const input = {
				name: "Invalid Key",
				publicKey: "This is not a valid PGP key",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe("Invalid GPG public key");
			}
		});

		it("should reject public key without proper header", () => {
			const input = {
				name: "No Header",
				publicKey: `-----END PGP PUBLIC KEY BLOCK-----
mQGNBGcGfpMBDADGkL7qvL0kZ
-----END PGP PUBLIC KEY BLOCK-----`,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe("Invalid GPG public key");
			}
		});

		it("should reject public key without proper footer", () => {
			const input = {
				name: "No Footer",
				publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----
mQGNBGcGfpMBDADGkL7qvL0kZ`,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe("Invalid GPG public key");
			}
		});

		it("should accept empty private key", () => {
			const input = {
				name: "Public Only",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: "",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
		});

		it("should reject invalid private key format", () => {
			const input = {
				name: "Invalid Private Key",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: "Not a valid private key",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe("Invalid GPG private key");
			}
		});

		it("should reject private key without proper header", () => {
			const input = {
				name: "Bad Private Key",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: `lQWGBGcGfpMBDADGkL7qvL0kZ
-----END PGP PRIVATE KEY BLOCK-----`,
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toBe("Invalid GPG private key");
			}
		});

		it("should accept optional passphrase", () => {
			const input = {
				name: "With Passphrase",
				publicKey: VALID_PUBLIC_KEY,
				passphrase: "my-secure-passphrase-123",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.passphrase).toBe("my-secure-passphrase-123");
			}
		});

		it("should trim passphrase whitespace", () => {
			const input = {
				name: "Passphrase Trim",
				publicKey: VALID_PUBLIC_KEY,
				passphrase: "   my-passphrase   ",
			};

			const result = gpgKeyCreate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.passphrase).toBe("my-passphrase");
			}
		});
	});

	describe("gpgKeyUpdate schema", () => {
		it("should validate complete update with all fields", () => {
			const input = {
				name: "Updated Name",
				description: "Updated description",
				publicKey: VALID_PUBLIC_KEY,
				privateKey: VALID_PRIVATE_KEY,
				passphrase: "new-passphrase",
			};

			const result = gpgKeyUpdate.safeParse(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("Updated Name");
				expect(result.data.description).toBe("Updated description");
			}
		});

		it("should require public key even for partial updates", () => {
			const input = {
				description: "New description",
			};

			const result = gpgKeyUpdate.safeParse(input);

			// gpgKeyUpdate requires publicKey since it picks from gpgKeyCreate
			expect(result.success).toBe(false);
		});

		it("should validate updating with only public key", () => {
			const input = {
				publicKey: VALID_PUBLIC_KEY,
			};

			const result = gpgKeyUpdate.safeParse(input);

			expect(result.success).toBe(true);
		});

		it("should validate updating name with public key", () => {
			const input = {
				name: "New Name",
				publicKey: VALID_PUBLIC_KEY,
			};

			const result = gpgKeyUpdate.safeParse(input);

			expect(result.success).toBe(true);
		});

		it("should validate updating with private key and public key", () => {
			const input = {
				publicKey: VALID_PUBLIC_KEY,
				privateKey: VALID_PRIVATE_KEY,
			};

			const result = gpgKeyUpdate.safeParse(input);

			expect(result.success).toBe(true);
		});

		it("should reject invalid public key in update", () => {
			const input = {
				publicKey: "invalid key",
			};

			const result = gpgKeyUpdate.safeParse(input);

			expect(result.success).toBe(false);
		});

		it("should reject invalid private key in update", () => {
			const input = {
				publicKey: VALID_PUBLIC_KEY,
				privateKey: "invalid private key",
			};

			const result = gpgKeyUpdate.safeParse(input);

			expect(result.success).toBe(false);
		});
	});
});

