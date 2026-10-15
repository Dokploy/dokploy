import {
	createReadStream,
	createWriteStream,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	decryptField,
	deriveKeys,
	encryptField,
	gcmDecryptStream,
	gcmEncryptStream,
	makeKeyCheck,
	TransferCryptoError,
	verifyKeyCheck,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

describe("deriveKeys", () => {
	it("rejects a passphrase shorter than 12 characters", async () => {
		await expect(deriveKeys("short")).rejects.toThrow();
	});

	it("derives the same keys from the same passphrase and salt", async () => {
		const first = await deriveKeys("correct-horse-battery-staple");
		const second = await deriveKeys("correct-horse-battery-staple", first.salt);
		expect(second.kEnc.equals(first.kEnc)).toBe(true);
		expect(second.salt).toBe(first.salt);
	});

	it("derives different keys for a different salt", async () => {
		const first = await deriveKeys("correct-horse-battery-staple");
		const second = await deriveKeys("correct-horse-battery-staple");
		expect(second.salt).not.toBe(first.salt);
		expect(second.kEnc.equals(first.kEnc)).toBe(false);
	});

	it("derives different keys for a different passphrase with the same salt", async () => {
		const first = await deriveKeys("correct-horse-battery-staple");
		const second = await deriveKeys("another-passphrase-entirely", first.salt);
		expect(second.kEnc.equals(first.kEnc)).toBe(false);
	});
});

describe("encryptField / decryptField", () => {
	it("round-trips a plaintext value", async () => {
		const { kEnc } = await deriveKeys("correct-horse-battery-staple");
		const entry = encryptField(kEnc, "secret-1", "hunter2");
		expect(decryptField(kEnc, "secret-1", entry)).toBe("hunter2");
	});

	it("fails when the AAD (id) differs from the one used to encrypt", async () => {
		const { kEnc } = await deriveKeys("correct-horse-battery-staple");
		const entry = encryptField(kEnc, "secret-1", "hunter2");
		expect(() => decryptField(kEnc, "secret-2", entry)).toThrow(
			TransferCryptoError,
		);
	});

	it("fails when decrypting with a different key", async () => {
		const { kEnc } = await deriveKeys("correct-horse-battery-staple");
		const { kEnc: otherKEnc } = await deriveKeys("a-different-passphrase!!");
		const entry = encryptField(kEnc, "secret-1", "hunter2");
		expect(() => decryptField(otherKEnc, "secret-1", entry)).toThrow(
			TransferCryptoError,
		);
	});
});

describe("makeKeyCheck / verifyKeyCheck", () => {
	it("verifies with the correct passphrase", async () => {
		const { kEnc, salt } = await deriveKeys("correct-horse-battery-staple");
		const keyCheck = makeKeyCheck(kEnc);
		const { kEnc: reDerived } = await deriveKeys(
			"correct-horse-battery-staple",
			salt,
		);
		expect(verifyKeyCheck(reDerived, keyCheck)).toBe(true);
	});

	it("fails with the wrong passphrase", async () => {
		const { kEnc, salt } = await deriveKeys("correct-horse-battery-staple");
		const keyCheck = makeKeyCheck(kEnc);
		const { kEnc: wrongKEnc } = await deriveKeys(
			"totally-wrong-passphrase",
			salt,
		);
		expect(verifyKeyCheck(wrongKEnc, keyCheck)).toBe(false);
	});
});

describe("gcmDecryptStream edge cases", () => {
	it("handles an empty payload, one-byte chunks and a truncated ciphertext", async () => {
		const { kEnc } = await deriveKeys("correct-horse-battery-staple");
		const encrypt = async (bytes: Buffer) => {
			const chunks: Buffer[] = [];
			await pipeline(
				Readable.from([bytes]),
				gcmEncryptStream(kEnc),
				new Writable({
					write(chunk, _encoding, callback) {
						chunks.push(chunk);
						callback();
					},
				}),
			);
			return Buffer.concat(chunks);
		};
		const decrypt = async (bytes: Buffer, chunkSize: number) => {
			const chunks: Buffer[] = [];
			const pieces: Buffer[] = [];
			for (let i = 0; i < bytes.length; i += chunkSize) {
				pieces.push(bytes.subarray(i, i + chunkSize));
			}
			await pipeline(
				Readable.from(pieces),
				gcmDecryptStream(kEnc),
				new Writable({
					write(chunk, _encoding, callback) {
						chunks.push(chunk);
						callback();
					},
				}),
			);
			return Buffer.concat(chunks);
		};

		const empty = await encrypt(Buffer.alloc(0));
		expect(empty.length).toBe(12 + 16);
		expect((await decrypt(empty, 1)).length).toBe(0);

		const small = await encrypt(Buffer.from("hello world, 21 bytes"));
		expect((await decrypt(small, 1)).toString()).toBe("hello world, 21 bytes");

		await expect(decrypt(small.subarray(0, 20), 1)).rejects.toThrow(
			TransferCryptoError,
		);
	});
});

describe("gcmEncryptStream / gcmDecryptStream", () => {
	it("round-trips a file and rejects a flipped byte", async () => {
		const dir = mkdtempSync(join(tmpdir(), "transfer-crypto-file-"));
		try {
			const { kEnc } = await deriveKeys("correct-horse-battery-staple");
			const plain = join(dir, "plain.bin");
			const enc = join(dir, "plain.enc");
			const out = join(dir, "plain.out");
			writeFileSync(plain, Buffer.alloc(100_000, 7));
			await pipeline(
				createReadStream(plain),
				gcmEncryptStream(kEnc),
				createWriteStream(enc),
			);
			expect(readFileSync(enc).length).toBe(100_000 + 12 + 16);
			await pipeline(
				createReadStream(enc),
				gcmDecryptStream(kEnc),
				createWriteStream(out),
			);
			expect(readFileSync(out).equals(readFileSync(plain))).toBe(true);

			const bytes = readFileSync(enc);
			bytes[100] = (bytes[100] ?? 0) ^ 0xff;
			writeFileSync(enc, bytes);
			await expect(
				pipeline(
					createReadStream(enc),
					gcmDecryptStream(kEnc),
					createWriteStream(out),
				),
			).rejects.toThrow(TransferCryptoError);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
