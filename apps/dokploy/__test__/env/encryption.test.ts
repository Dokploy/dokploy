import {
	decryptValue,
	encryptValue,
	isEncrypted,
} from "@dokploy/server/lib/encryption";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("encryptValue / decryptValue", () => {
	it("round-trips a value", () => {
		const value =
			"DATABASE_URL=postgres://user:secret@host:5432/db\nAPI_KEY=123";
		const encrypted = encryptValue(value);

		expect(encrypted).not.toBe(value);
		expect(isEncrypted(encrypted)).toBe(true);
		expect(encrypted).not.toContain("secret");
		expect(decryptValue(encrypted)).toBe(value);
	});

	it("uses a random IV so equal inputs produce different ciphertexts", () => {
		const value = "KEY=value";
		expect(encryptValue(value)).not.toBe(encryptValue(value));
	});

	it("passes legacy plaintext through on decrypt", () => {
		const plaintext = "KEY=legacy-plaintext-value";
		expect(decryptValue(plaintext)).toBe(plaintext);
	});

	it("passes empty values through unchanged", () => {
		expect(encryptValue("")).toBe("");
		expect(decryptValue("")).toBe("");
	});

	it("does not double-encrypt an already encrypted value", () => {
		const encrypted = encryptValue("KEY=value");
		expect(encryptValue(encrypted)).toBe(encrypted);
	});

	it("throws a descriptive error on tampered ciphertext", () => {
		const encrypted = encryptValue("KEY=value");
		const tampered = `${encrypted.slice(0, -4)}AAAA`;
		expect(() => decryptValue(tampered)).toThrow(/BETTER_AUTH_SECRET/);
	});
});

describe("dedicated ENCRYPTION_KEY", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	const loadWithEncryptionKey = async (key: string) => {
		vi.stubEnv("ENCRYPTION_KEY", key);
		vi.resetModules();
		return await import("@dokploy/server/lib/encryption");
	};

	it("encrypts with the dedicated key when set", async () => {
		const withKey = await loadWithEncryptionKey("my-dedicated-key");
		const encrypted = withKey.encryptValue("KEY=value");

		expect(withKey.decryptValue(encrypted)).toBe("KEY=value");
		// The default (auth-secret derived) module cannot read it
		expect(() => decryptValue(encrypted)).toThrow(/ENCRYPTION_KEY/);
	});

	it("still decrypts legacy values via the auth-secret fallback", async () => {
		// Encrypted before the install adopted a dedicated key
		const legacyEncrypted = encryptValue("KEY=legacy-value");

		const withKey = await loadWithEncryptionKey("my-dedicated-key");
		expect(withKey.decryptValue(legacyEncrypted)).toBe("KEY=legacy-value");
	});

	it("re-encrypts with the dedicated key on write", async () => {
		const withKey = await loadWithEncryptionKey("my-dedicated-key");
		const reEncrypted = withKey.encryptValue(
			withKey.decryptValue(encryptValue("KEY=migrated")),
		);

		const other = await loadWithEncryptionKey("another-key");
		// Readable only by the dedicated key (or its own fallback), proving
		// the write used the primary key, not the legacy one
		expect(withKey.decryptValue(reEncrypted)).toBe("KEY=migrated");
		expect(() => other.decryptValue(reEncrypted)).toThrow();
	});
});
