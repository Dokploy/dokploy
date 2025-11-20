import crypto from "node:crypto";

/**
 * Encryption utility for securing sensitive data like API tokens
 * Uses AES-256-GCM for authenticated encryption
 */

// Get encryption key from environment or generate a default (should be set in production)
const ENCRYPTION_KEY =
	process.env.PROVIDER_ENCRYPTION_KEY ||
	"change-this-to-a-secure-32-byte-key-in-production!";

// Ensure key is 32 bytes for AES-256
const KEY = crypto
	.createHash("sha256")
	.update(ENCRYPTION_KEY)
	.digest("base64")
	.slice(0, 32);

/**
 * Encrypt sensitive data
 */
export function encrypt(text: string): string {
	try {
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

		let encrypted = cipher.update(text, "utf8", "hex");
		encrypted += cipher.final("hex");

		const authTag = cipher.getAuthTag();

		// Return iv:authTag:encrypted
		return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
	} catch (error) {
		throw new Error(
			`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedData: string): string {
	try {
		const parts = encryptedData.split(":");
		if (parts.length !== 3) {
			throw new Error("Invalid encrypted data format");
		}

		const ivHex = parts[0];
		const authTagHex = parts[1];
		const encrypted = parts[2];

		if (!ivHex || !authTagHex || !encrypted) {
			throw new Error("Invalid encrypted data format");
		}

		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");

		const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		throw new Error(
			`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Check if a string appears to be encrypted
 */
export function isEncrypted(data: string): boolean {
	const parts = data.split(":");
	return parts.length === 3 && parts.every((part) => /^[0-9a-f]+$/i.test(part));
}

// Aliases for API compatibility
export { encrypt as encryptToken, decrypt as decryptToken };
