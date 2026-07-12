import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { betterAuthSecret } from "./auth-secret";
import { encryptionSecret } from "./encryption-secret";

export const ENCRYPTION_KEY_BACKUP_FILE = "encryption.key";

const ENCRYPTION_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const deriveKey = (secret: string) =>
	createHmac("sha256", secret).update("dokploy:db-encryption:v1").digest();

const primaryKey = deriveKey(encryptionSecret ?? betterAuthSecret);

// Installs that adopt a dedicated ENCRYPTION_KEY still hold values encrypted
// with the auth-secret-derived key; keep it as a decrypt fallback so they
// lazily re-encrypt on the next write instead of becoming unreadable.
const decryptionKeys = encryptionSecret
	? [primaryKey, deriveKey(betterAuthSecret)]
	: [primaryKey];

export const exportEncryptionKey = () => primaryKey.toString("hex");

let restoredKey: Buffer | undefined;

// A backup created with "include encryption key" places the original
// server's key at BASE_PATH when restored; use it as a last-resort
// decryption fallback so restored values keep working on the new server.
const loadRestoredKey = (): Buffer | undefined => {
	if (restoredKey) {
		return restoredKey;
	}
	try {
		const { BASE_PATH } = paths();
		const hex = readFileSync(
			join(BASE_PATH, ENCRYPTION_KEY_BACKUP_FILE),
			"utf8",
		).trim();
		const key = Buffer.from(hex, "hex");
		if (key.length === 32 && !key.equals(primaryKey)) {
			restoredKey = key;
		}
	} catch {
		// No restored key file present.
	}
	return restoredKey;
};

export const isEncrypted = (value: string) =>
	value.startsWith(ENCRYPTION_PREFIX);

export const encryptValue = (value: string): string => {
	if (!value || isEncrypted(value)) {
		return value;
	}
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv("aes-256-gcm", primaryKey, iv);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return `${ENCRYPTION_PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")}`;
};

export const decryptValue = (value: string): string => {
	if (!value || !isEncrypted(value)) {
		return value;
	}
	const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), "base64");
	const iv = payload.subarray(0, IV_LENGTH);
	const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const restored = loadRestoredKey();
	const keys = restored ? [...decryptionKeys, restored] : decryptionKeys;
	for (const key of keys) {
		try {
			const decipher = createDecipheriv("aes-256-gcm", key, iv);
			decipher.setAuthTag(authTag);
			return Buffer.concat([
				decipher.update(encrypted),
				decipher.final(),
			]).toString("utf8");
		} catch {
			// GCM auth failed for this key; try the next one.
		}
	}
	throw new Error(
		"Failed to decrypt a stored secret. This usually means ENCRYPTION_KEY or BETTER_AUTH_SECRET changed after the value was encrypted.",
	);
};
