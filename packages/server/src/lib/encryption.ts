import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { betterAuthSecret, HARDCODED_LEGACY_SECRET } from "./auth-secret";
import { encryptionSecret } from "./encryption-secret";

export const ENCRYPTION_KEY_BACKUP_FILE = "encryption.key";

const ENCRYPTION_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const deriveKey = (secret: string) =>
	createHmac("sha256", secret).update("dokploy:db-encryption:v1").digest();

const primaryKey = deriveKey(encryptionSecret ?? betterAuthSecret);

const dedupeKeys = (keys: Buffer[]) => {
	const seen = new Set<string>();
	return keys.filter((key) => {
		const hex = key.toString("hex");
		if (seen.has(hex)) {
			return false;
		}
		seen.add(hex);
		return true;
	});
};

// Installs that adopt a dedicated ENCRYPTION_KEY still hold values encrypted
// with the auth-secret-derived key; keep it as a decrypt fallback so they
// lazily re-encrypt on the next write instead of becoming unreadable.
//
// The same applies to installs migrating off the deprecated hardcoded auth
// secret, which the startup banner asks every affected user to do: their
// values are encrypted with the legacy-derived key. HARDCODED_LEGACY_SECRET
// is a published constant, so keeping it as a decrypt-only fallback discloses
// nothing that was not already derivable from the source, while stopping the
// migration from orphaning existing values. Encryption always uses
// primaryKey, so values written after the migration are protected by the
// real secret.
const decryptionKeys = dedupeKeys([
	primaryKey,
	...(encryptionSecret ? [deriveKey(betterAuthSecret)] : []),
	deriveKey(HARDCODED_LEGACY_SECRET),
]);

// Derived keys only — never the raw secrets. A leaked key can decrypt
// stored values, but the raw BETTER_AUTH_SECRET could also forge sessions.
export const exportEncryptionKeys = () =>
	decryptionKeys.map((key) => key.toString("hex")).join("\n");

let restoredKeys: Buffer[] | undefined;

// A backup created with "include encryption key" places the original
// server's keys at BASE_PATH when restored; use them as a last-resort
// decryption fallback so restored values keep working on the new server.
const loadRestoredKeys = (): Buffer[] => {
	if (restoredKeys?.length) {
		return restoredKeys;
	}
	try {
		const { BASE_PATH } = paths();
		const keys = readFileSync(
			join(BASE_PATH, ENCRYPTION_KEY_BACKUP_FILE),
			"utf8",
		)
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((hex) => Buffer.from(hex, "hex"))
			.filter(
				(key) =>
					key.length === 32 && !decryptionKeys.some((own) => own.equals(key)),
			);
		if (keys.length) {
			restoredKeys = keys;
		}
	} catch {
		// No restored key file present.
	}
	return restoredKeys ?? [];
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
	const keys = [...decryptionKeys, ...loadRestoredKeys()];
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
