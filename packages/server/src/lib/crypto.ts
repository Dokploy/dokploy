// import {
// 	decodeHex,
// 	encodeBase32LowerCaseNoPadding,
// 	encodeHexLowerCase,
// } from "@oslojs/encoding";
// import { generateRandomString } from "@oslojs/crypto/random";
// import { constantTimeEqual } from "@oslojs/crypto/subtle";
// import { scrypt } from "./scrypt/index";

// import type { RandomReader } from "@oslojs/crypto/random";

// async function generateScryptKey(
// 	data: string,
// 	salt: string,
// 	blockSize = 16,
// ): Promise<Uint8Array> {
// 	const encodedData = new TextEncoder().encode(data);
// 	const encodedSalt = new TextEncoder().encode(salt);
// 	const keyUint8Array = await scrypt(encodedData, encodedSalt, {
// 		N: 16384,
// 		r: blockSize,
// 		p: 1,
// 		dkLen: 64,
// 	});
// 	return new Uint8Array(keyUint8Array);
// }

// const random: RandomReader = {
// 	read(bytes: Uint8Array): void {
// 		crypto.getRandomValues(bytes);
// 	},
// };

// export function generateId(length: number): string {
// 	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
// 	return generateRandomString(random, alphabet, length);
// }

// export function generateIdFromEntropySize(size: number): string {
// 	const buffer = crypto.getRandomValues(new Uint8Array(size));
// 	return encodeBase32LowerCaseNoPadding(buffer);
// }

// export class Scrypt implements PasswordHashingAlgorithm {
// 	async hash(password: string): Promise<string> {
// 		const salt = encodeHexLowerCase(crypto.getRandomValues(new Uint8Array(16)));
// 		const key = await generateScryptKey(password.normalize("NFKC"), salt);
// 		return `${salt}:${encodeHexLowerCase(key)}`;
// 	}
// 	async verify(hash: string, password: string): Promise<boolean> {
// 		const parts = hash.split(":");
// 		if (parts.length !== 2) return false;

// 		const [salt, key] = parts;
// 		const targetKey = await generateScryptKey(password.normalize("NFKC"), salt);
// 		return constantTimeEqual(targetKey, decodeHex(key));
// 	}
// }

// export class LegacyScrypt implements PasswordHashingAlgorithm {
// 	async hash(password: string): Promise<string> {
// 		const salt = encodeHexLowerCase(crypto.getRandomValues(new Uint8Array(16)));
// 		const key = await generateScryptKey(password.normalize("NFKC"), salt);
// 		return `s2:${salt}:${encodeHexLowerCase(key)}`;
// 	}
// 	async verify(hash: string, password: string): Promise<boolean> {
// 		const parts = hash.split(":");
// 		if (parts.length === 2) {
// 			const [salt, key] = parts;
// 			const targetKey = await generateScryptKey(
// 				password.normalize("NFKC"),
// 				salt,
// 				8,
// 			);
// 			const result = constantTimeEqual(targetKey, decodeHex(key));
// 			return result;
// 		}
// 		if (parts.length !== 3) return false;
// 		const [version, salt, key] = parts;
// 		if (version === "s2") {
// 			const targetKey = await generateScryptKey(
// 				password.normalize("NFKC"),
// 				salt,
// 			);
// 			return constantTimeEqual(targetKey, decodeHex(key));
// 		}
// 		return false;
// 	}
// }

// export interface PasswordHashingAlgorithm {
// 	hash(password: string): Promise<string>;
// 	verify(hash: string, password: string): Promise<boolean>;
// }
