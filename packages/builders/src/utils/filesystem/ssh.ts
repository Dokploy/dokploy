import { utils } from "ssh2";

export const generateSSHKey = async (type: "rsa" | "ed25519" = "rsa") => {
	try {
		if (type === "rsa") {
			const keys = utils.generateKeyPairSync("rsa", {
				bits: 4096,
				comment: "dokploy",
			});
			return {
				privateKey: keys.private,
				publicKey: keys.public,
			};
		}
		const keys = utils.generateKeyPairSync("ed25519", {
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
