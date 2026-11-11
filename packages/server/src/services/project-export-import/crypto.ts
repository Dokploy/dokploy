import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scrypt,
} from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
	BUNDLE_FORMAT,
	BUNDLE_FORMAT_VERSION,
	type Envelope,
	MAX_BUNDLE_BYTES,
	MIN_PASSPHRASE_LENGTH,
} from "./types";

export class BundleCryptoError extends Error {
	constructor(
		message = "Failed to decrypt: wrong passphrase or corrupted bundle",
	) {
		super(message);
		this.name = "BundleCryptoError";
	}
}

const deriveKey = (passphrase: string, salt: Buffer): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		scrypt(
			passphrase,
			salt,
			32,
			{ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
			(error, key) => (error ? reject(error) : resolve(key)),
		);
	});

const aad = Buffer.from(`${BUNDLE_FORMAT}:${BUNDLE_FORMAT_VERSION}`);

export const encryptPayload = async (
	json: string,
	passphrase: string,
): Promise<Pick<Envelope, "kdf" | "iv" | "tag" | "data">> => {
	if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
		throw new Error(
			`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long`,
		);
	}
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const cipher = createCipheriv(
		"aes-256-gcm",
		await deriveKey(passphrase, salt),
		iv,
	);
	cipher.setAAD(aad);
	const data = Buffer.concat([
		cipher.update(gzipSync(Buffer.from(json, "utf8"))),
		cipher.final(),
	]);
	return {
		kdf: { salt: salt.toString("base64") },
		iv: iv.toString("base64"),
		tag: cipher.getAuthTag().toString("base64"),
		data: data.toString("base64"),
	};
};

export const decryptPayload = async (
	envelope: Envelope,
	passphrase: string,
): Promise<string> => {
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			await deriveKey(passphrase, Buffer.from(envelope.kdf.salt, "base64")),
			Buffer.from(envelope.iv, "base64"),
		);
		decipher.setAAD(aad);
		decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
		const compressed = Buffer.concat([
			decipher.update(Buffer.from(envelope.data, "base64")),
			decipher.final(),
		]);
		return gunzipSync(compressed, {
			maxOutputLength: MAX_BUNDLE_BYTES,
		}).toString("utf8");
	} catch {
		throw new BundleCryptoError();
	}
};
