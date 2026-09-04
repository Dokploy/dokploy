import * as ssh2 from "ssh2";

export const generateSSHKey = async (type: "rsa" | "ed25519" = "rsa") => {
	try {
		if (type === "rsa") {
			const keys = ssh2.utils.generateKeyPairSync("rsa", {
				bits: 4096,
				comment: "dokploy",
			});
			return {
				privateKey: keys.private,
				publicKey: keys.public,
			};
		}
		const keys = ssh2.utils.generateKeyPairSync("ed25519", {
			comment: "dokploy",
		});

		return {
			privateKey: keys.private,
			publicKey: keys.public,
		};
	} catch (error) {
		throw error;
	}
};

export type SshPrivateKeyValidation =
	| { ok: true }
	| { ok: false; encrypted: boolean; message: string };

export const validateSshPrivateKeyParseable = (
	privateKey: string,
): SshPrivateKeyValidation => {
	const parsed = ssh2.utils.parseKey(privateKey);
	if (parsed instanceof Error) {
		const encrypted = /encrypt/i.test(parsed.message);
		return {
			ok: false,
			encrypted,
			message: encrypted
				? "Passphrase-protected SSH keys are not supported. Remove the passphrase before importing the key (e.g. `ssh-keygen -p -f <keyfile>`)."
				: `Invalid private key: ${parsed.message}`,
		};
	}
	return { ok: true };
};
