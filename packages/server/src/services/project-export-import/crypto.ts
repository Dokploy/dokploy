import {
	createCipheriv,
	createDecipheriv,
	type DecipherGCM,
	randomBytes,
	scrypt,
} from "node:crypto";
import { Transform } from "node:stream";
import { KDF_PARAMS } from "./types";

const deriveScryptKey = (
	passphrase: string,
	salt: Buffer,
	keylen: number,
): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		scrypt(
			passphrase,
			salt,
			keylen,
			{
				N: KDF_PARAMS.N,
				r: KDF_PARAMS.r,
				p: KDF_PARAMS.p,
				maxmem: 64 * 1024 * 1024,
			},
			(err, derivedKey) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(derivedKey);
			},
		);
	});

export class TransferCryptoError extends Error {
	constructor(
		message = "Failed to decrypt: wrong passphrase or corrupted bundle",
	) {
		super(message);
		this.name = "TransferCryptoError";
	}
}

const IV_LENGTH = 12;
const KEY_LENGTH = KDF_PARAMS.dkLen / 2;
const KEY_CHECK_ID = "keyCheck";
const KEY_CHECK_PLAINTEXT = "dokploy-export-v1";

export type DerivedKeys = { salt: string; kEnc: Buffer };
export type EncryptedEntry = { iv: string; ct: string; tag: string };

export const assertPassphrase = (passphrase: string) => {
	if (passphrase.length < 12) {
		throw new Error("Passphrase must be at least 12 characters long");
	}
};

export const deriveKeys = async (
	passphrase: string,
	saltInput?: string,
): Promise<DerivedKeys> => {
	assertPassphrase(passphrase);
	const salt = saltInput ? Buffer.from(saltInput, "base64") : randomBytes(16);
	const derived = await deriveScryptKey(passphrase, salt, KDF_PARAMS.dkLen);
	return {
		salt: salt.toString("base64"),
		kEnc: derived.subarray(0, KEY_LENGTH),
	};
};

export const encryptField = (
	kEnc: Buffer,
	id: string,
	plaintext: string,
): EncryptedEntry => {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv("aes-256-gcm", kEnc, iv);
	cipher.setAAD(Buffer.from(id, "utf8"));
	const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return {
		iv: iv.toString("base64"),
		ct: ct.toString("base64"),
		tag: cipher.getAuthTag().toString("base64"),
	};
};

export const decryptField = (
	kEnc: Buffer,
	id: string,
	entry: EncryptedEntry,
): string => {
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			kEnc,
			Buffer.from(entry.iv, "base64"),
		);
		decipher.setAAD(Buffer.from(id, "utf8"));
		decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
		return Buffer.concat([
			decipher.update(Buffer.from(entry.ct, "base64")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw new TransferCryptoError();
	}
};

export const makeKeyCheck = (kEnc: Buffer): string =>
	JSON.stringify(encryptField(kEnc, KEY_CHECK_ID, KEY_CHECK_PLAINTEXT));

export const verifyKeyCheck = (kEnc: Buffer, keyCheck: string): boolean => {
	try {
		const entry = JSON.parse(keyCheck) as EncryptedEntry;
		return decryptField(kEnc, KEY_CHECK_ID, entry) === KEY_CHECK_PLAINTEXT;
	} catch {
		return false;
	}
};

const FILE_TAG_LENGTH = 16;

export const gcmEncryptStream = (kEnc: Buffer): Transform => {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv("aes-256-gcm", kEnc, iv);
	let started = false;
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			if (!started) {
				started = true;
				this.push(iv);
			}
			callback(null, cipher.update(chunk));
		},
		flush(callback) {
			if (!started) this.push(iv);
			this.push(cipher.final());
			this.push(cipher.getAuthTag());
			callback();
		},
	});
};

export const gcmDecryptStream = (kEnc: Buffer): Transform => {
	let head = Buffer.alloc(0);
	let decipher: DecipherGCM | undefined;
	let tail = Buffer.alloc(0);
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			let data = chunk;
			if (!decipher) {
				head = Buffer.concat([head, data]);
				if (head.length < IV_LENGTH) return callback();
				decipher = createDecipheriv(
					"aes-256-gcm",
					kEnc,
					head.subarray(0, IV_LENGTH),
				) as DecipherGCM;
				data = head.subarray(IV_LENGTH);
			}
			const combined = Buffer.concat([tail, data]);
			if (combined.length <= FILE_TAG_LENGTH) {
				tail = combined;
				return callback();
			}
			tail = combined.subarray(combined.length - FILE_TAG_LENGTH);
			callback(
				null,
				decipher.update(
					combined.subarray(0, combined.length - FILE_TAG_LENGTH),
				),
			);
		},
		flush(callback) {
			if (!decipher || tail.length < FILE_TAG_LENGTH) {
				return callback(new TransferCryptoError());
			}
			try {
				decipher.setAuthTag(tail);
				this.push(decipher.final());
				callback();
			} catch {
				callback(new TransferCryptoError());
			}
		},
	});
};
