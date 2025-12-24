import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// Encryption key should be stored in environment variable
// If not set, generate a key (not recommended for production)
const getEncryptionKey = async (): Promise<Buffer> => {
	const keyFromEnv = process.env.MOUNT_CREDENTIALS_ENCRYPTION_KEY;
	if (keyFromEnv) {
		// If key is provided as hex string, convert it
		if (keyFromEnv.length === 64) {
			// 32 bytes = 64 hex characters
			return Buffer.from(keyFromEnv, "hex");
		}
		// Otherwise derive key from password using scrypt
		const salt = Buffer.from("dokploy-mount-credentials-salt", "utf8");
		return (await scryptAsync(keyFromEnv, salt, 32)) as Buffer;
	}

	// Fallback: generate a key (should only be used in development)
	console.warn(
		"WARNING: MOUNT_CREDENTIALS_ENCRYPTION_KEY not set. Using default key (not secure for production!)",
	);
	const defaultKey = "dokploy-default-mount-credentials-key-change-in-production";
	const salt = Buffer.from("dokploy-mount-credentials-salt", "utf8");
	return (await scryptAsync(defaultKey, salt, 32)) as Buffer;
};

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM authentication tag

/**
 * Encrypts a plaintext string using AES-256-GCM
 * @param plaintext - The text to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all base64)
 */
export const encryptCredential = async (
	plaintext: string,
): Promise<string> => {
	if (!plaintext) {
		return "";
	}

	const key = await getEncryptionKey();
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	cipher.setAAD(Buffer.from("dokploy-mount-credentials", "utf8"));

	let encrypted = cipher.update(plaintext, "utf8", "base64");
	encrypted += cipher.final("base64");

	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:encryptedData (all base64)
	return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
};

/**
 * Decrypts an encrypted string using AES-256-GCM
 * @param encrypted - The encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext string
 */
export const decryptCredential = async (
	encrypted: string,
): Promise<string> => {
	if (!encrypted) {
		return "";
	}

	const key = await getEncryptionKey();

	// Parse the encrypted string: iv:authTag:encryptedData
	const parts = encrypted.split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted credential format");
	}

	const [ivBase64, authTagBase64, encryptedData] = parts;
	const iv = Buffer.from(ivBase64, "base64");
	const authTag = Buffer.from(authTagBase64, "base64");

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAAD(Buffer.from("dokploy-mount-credentials", "utf8"));
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(encryptedData, "base64", "utf8");
	decrypted += decipher.final("utf8");

	return decrypted;
};

/**
 * Encrypts mount credentials (username and password)
 * @param credentials - Object with username and password
 * @returns Encrypted credentials object
 */
export const encryptMountCredentials = async (credentials: {
	username: string;
	password: string;
	domain?: string;
}): Promise<{
	username: string;
	password: string;
	domain?: string;
}> => {
	const [encryptedUsername, encryptedPassword, encryptedDomain] =
		await Promise.all([
			encryptCredential(credentials.username),
			encryptCredential(credentials.password),
			credentials.domain ? encryptCredential(credentials.domain) : undefined,
		]);

	return {
		username: encryptedUsername,
		password: encryptedPassword,
		...(encryptedDomain && { domain: encryptedDomain }),
	};
};

/**
 * Decrypts mount credentials (username and password)
 * @param encryptedCredentials - Object with encrypted username and password
 * @returns Decrypted credentials object
 */
export const decryptMountCredentials = async (encryptedCredentials: {
	username: string;
	password: string;
	domain?: string;
}): Promise<{
	username: string;
	password: string;
	domain?: string;
}> => {
	const [decryptedUsername, decryptedPassword, decryptedDomain] =
		await Promise.all([
			decryptCredential(encryptedCredentials.username),
			decryptCredential(encryptedCredentials.password),
			encryptedCredentials.domain
				? decryptCredential(encryptedCredentials.domain)
				: undefined,
		]);

	return {
		username: decryptedUsername,
		password: decryptedPassword,
		...(decryptedDomain && { domain: decryptedDomain }),
	};
};

