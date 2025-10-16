import {createCipheriv, createDecipheriv, randomBytes, scrypt} from "node:crypto";
import {promisify} from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * Encryption utility for sensitive secrets (SSH keys, GPG keys, passphrases)
 * Uses AES-256-GCM for authenticated encryption
 *
 */

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get the encryption seed from DATABASE_URL
 * Uses the database URL as a stable, unique seed per installation
 */
const getEncryptionSeed = (): string => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error(
            "DATABASE_URL environment variable is required for secrets encryption",
        );
    }

    // Hash the DATABASE_URL to create a stable encryption seed
    // This ensures we get a consistent key while not directly using the DB URL
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(databaseUrl).digest('hex');
};

/**
 * Encrypt a secret string
 * Format: salt:iv:authTag:encryptedData (all base64)
 */
export const encryptSecret = async (plaintext: string): Promise<string> => {
    if (!plaintext) {
        return "";
    }

    const seed = getEncryptionSeed();

    // Generate random salt and IV for this specific encryption
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Derive key from SECRET_KEY_BASE + salt using scrypt
    // This makes each encrypted value unique even with the same plaintext
    const key = (await scryptAsync(seed, salt, KEY_LENGTH)) as Buffer;

    // Encrypt
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: salt:iv:authTag:encrypted
    const result = [
        salt.toString("base64"),
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted.toString("base64"),
    ].join(":");

    return result;
};

/**
 * Decrypt a secret string
 */
export const decryptSecret = async (
    encrypted: string,
): Promise<string | null> => {
    if (!encrypted) {
        return null;
    }

    try {
        const seed = getEncryptionSeed();

        // Split the components
        const parts = encrypted.split(":");
        if (parts.length !== 4) {
            throw new Error("Invalid encrypted data format");
        }

        const saltB64 = parts[0];
        const ivB64 = parts[1];
        const authTagB64 = parts[2];
        const encryptedB64 = parts[3];

        if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
            throw new Error("Invalid encrypted data format - missing components");
        }

        const salt = Buffer.from(saltB64, "base64");
        const iv = Buffer.from(ivB64, "base64");
        const authTag = Buffer.from(authTagB64, "base64");
        const encryptedData = Buffer.from(encryptedB64, "base64");

        // Derive key from SECRET_KEY_BASE + salt using scrypt
        const key = (await scryptAsync(seed, salt, KEY_LENGTH)) as Buffer;

        // Decrypt
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final(),
        ]);

        return decrypted.toString("utf8");
    } catch (error) {
        console.error("Decryption failed:", error);
        return null;
    }
};

/**
 * Check if a value is encrypted (has the expected format)
 */
export const isEncrypted = (value: string): boolean => {
    if (!value) return false;
    const parts = value.split(":");
    return parts.length === 4;
};
