import CryptoJS from "crypto-js";

/**
 * Encryption key - in production, this should be stored in environment variables
 * For now, using a fixed key based on a combination that can be made configurable later
 */
const getEncryptionKey = (): string => {
	// In production, this should come from environment variable
	// For now, use a fixed key that can be configured
	return process.env.DOKPLOY_ENCRYPTION_KEY || "dokploy-s3-backup-encryption-key-2024";
};

/**
 * Encrypts a string value using AES encryption
 * @param text - The plain text to encrypt
 * @returns The encrypted string
 */
export function encryptValue(text: string): string {
	if (!text) return text;
	try {
		const encrypted = CryptoJS.AES.encrypt(text, getEncryptionKey()).toString();
		return encrypted;
	} catch (error) {
		console.error("Encryption error:", error);
		return text;
	}
}

/**
 * Decrypts an encrypted string value
 * @param encryptedText - The encrypted text to decrypt
 * @returns The decrypted plain text string
 */
export function decryptValue(encryptedText: string): string {
	if (!encryptedText) return encryptedText;
	try {
		const decrypted = CryptoJS.AES.decrypt(encryptedText, getEncryptionKey());
		const plainText = decrypted.toString(CryptoJS.enc.Utf8);
		// If decryption failed (wrong key or not encrypted), return original
		if (!plainText) {
			return encryptedText;
		}
		return plainText;
	} catch (error) {
		console.error("Decryption error:", error);
		// If decryption fails, assume it's already plain text
		return encryptedText;
	}
}

/**
 * Checks if a string appears to be encrypted
 * Encrypted strings typically have a specific format from crypto-js
 */
export function isEncrypted(value: string): boolean {
	if (!value) return false;
	// CryptoJS encrypted strings typically start with specific patterns
	// They are base64 encoded and have a specific structure
	try {
		// Try to decode as base64 to see if it's encrypted format
		const decoded = CryptoJS.enc.Base64.parse(value);
		// Encrypted strings from crypto-js are longer and have specific structure
		return value.length > 20 && /^[A-Za-z0-9+/=]+$/.test(value);
	} catch {
		return false;
	}
}
