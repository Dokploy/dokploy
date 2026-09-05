import { generateKeyPairSync as cryptoGenerateKeyPairSync } from "node:crypto";
import { sshKeyCreate } from "@dokploy/server/db/validations";
import { validateSshPrivateKeyParseable } from "@dokploy/server/utils/filesystem/ssh";
import * as ssh2 from "ssh2";
import { describe, expect, it } from "vitest";

const encryptedEd25519 = ssh2.utils.generateKeyPairSync("ed25519", {
	passphrase: "testpass",
	cipher: "aes256-ctr",
	rounds: 16,
	comment: "test",
}).private;

const plainEd25519 = ssh2.utils.generateKeyPairSync("ed25519", {
	comment: "test",
}).private;

const encryptedOpenSshRsa = ssh2.utils.generateKeyPairSync("rsa", {
	bits: 2048,
	passphrase: "testpass",
	cipher: "aes256-ctr",
	rounds: 16,
	comment: "test",
}).private;

const plainOpenSshRsa = ssh2.utils.generateKeyPairSync("rsa", {
	bits: 2048,
	comment: "test",
}).private;

const plainPkcs1Rsa = cryptoGenerateKeyPairSync("rsa", {
	modulusLength: 2048,
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
}).privateKey;

const malformedOpenSshKey = [
	"-----BEGIN OPENSSH PRIVATE KEY-----",
	"not-valid-base64-payload-!!!",
	"-----END OPENSSH PRIVATE KEY-----",
	"",
].join("\n");

describe("validateSshPrivateKeyParseable (server-side SSH key parseability gatekeeper)", () => {
	it("accepts an unencrypted OpenSSH ed25519 private key", () => {
		expect(validateSshPrivateKeyParseable(plainEd25519)).toEqual({ ok: true });
	});

	it("accepts an unencrypted OpenSSH RSA private key", () => {
		expect(validateSshPrivateKeyParseable(plainOpenSshRsa)).toEqual({
			ok: true,
		});
	});

	it("accepts an unencrypted PKCS#1 RSA private key (regression: non-OpenSSH formats still work)", () => {
		expect(validateSshPrivateKeyParseable(plainPkcs1Rsa)).toEqual({
			ok: true,
		});
	});

	it("rejects an encrypted OpenSSH ed25519 key (the reported bug) with a passphrase-specific message", () => {
		const result = validateSshPrivateKeyParseable(encryptedEd25519);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.encrypted).toBe(true);
			expect(result.message).toContain(
				"Passphrase-protected SSH keys are not supported",
			);
			expect(result.message).toContain("ssh-keygen -p");
		}
	});

	it("rejects an encrypted OpenSSH RSA key (bug scope is all OpenSSH-format encrypted keys, not just ed25519)", () => {
		const result = validateSshPrivateKeyParseable(encryptedOpenSshRsa);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.encrypted).toBe(true);
			expect(result.message).toContain(
				"Passphrase-protected SSH keys are not supported",
			);
		}
	});

	it("rejects a malformed OpenSSH key as a generic invalid key (not encrypted)", () => {
		const result = validateSshPrivateKeyParseable(malformedOpenSshKey);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.encrypted).toBe(false);
			expect(result.message).toContain("Invalid private key:");
		}
	});

	it("does not mutate or consume the input private key", () => {
		const before = encryptedEd25519;
		validateSshPrivateKeyParseable(encryptedEd25519);
		expect(encryptedEd25519).toBe(before);
	});
});

describe("sshKeyCreate privateKey refine (regex-only by design; the server-side parseKey check is the real gatekeeper)", () => {
	it("accepts a valid unencrypted OpenSSH ed25519 key", () => {
		const result = sshKeyCreate.shape.privateKey.safeParse(plainEd25519);
		expect(result.success).toBe(true);
	});

	it("accepts an encrypted OpenSSH ed25519 key, proving the regex cannot detect encryption", () => {
		const result = sshKeyCreate.shape.privateKey.safeParse(encryptedEd25519);
		expect(result.success).toBe(true);
	});

	it("accepts an encrypted OpenSSH RSA key, proving the regex cannot detect encryption for any OpenSSH-format key", () => {
		const result = sshKeyCreate.shape.privateKey.safeParse(encryptedOpenSshRsa);
		expect(result.success).toBe(true);
	});

	it("rejects a malformed private key at the format level", () => {
		const result = sshKeyCreate.shape.privateKey.safeParse("just some text");
		expect(result.success).toBe(false);
	});
});
