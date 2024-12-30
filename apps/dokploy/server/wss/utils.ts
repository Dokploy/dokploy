import { execAsync } from "@dokploy/server";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const HOME_PATH = process.env.HOME || process.env.USERPROFILE || "/";

const LOCAL_SSH_KEY_PATH = path.join(
	HOME_PATH,
	".ssh",
	"auto_generated-dokploy-local",
);

const AUTHORIZED_KEYS_PATH = path.join(HOME_PATH, ".ssh", "authorized_keys");

export const getShell = () => {
	switch (os.platform()) {
		case "win32":
			return "powershell.exe";
		case "darwin":
			return "zsh";
		default:
			return "bash";
	}
};

/** Returns private SSH key for dokploy local server terminal. Uses already created SSH key or generates a new SSH key, also automatically appends the public key to `authorized_keys`, creating the file if needed. */
export const setupLocalServerSSHKey = async () => {
	try {
		if (!fs.existsSync(LOCAL_SSH_KEY_PATH)) {
			// Generate new SSH key if it hasn't been created yet
			await execAsync(
				`ssh-keygen -t rsa -b 4096 -f ${LOCAL_SSH_KEY_PATH} -N ""`,
			);
		}

		const privateKey = fs.readFileSync(LOCAL_SSH_KEY_PATH, "utf8");
		const publicKey = fs.readFileSync(`${LOCAL_SSH_KEY_PATH}.pub`, "utf8");
		const authKeyContent = `${publicKey}\n`;

		if (!fs.existsSync(AUTHORIZED_KEYS_PATH)) {
			// Create authorized_keys if it doesn't exist yet
			fs.writeFileSync(AUTHORIZED_KEYS_PATH, authKeyContent, { mode: 0o600 });
			return privateKey;
		}

		const existingAuthKeys = fs.readFileSync(AUTHORIZED_KEYS_PATH, "utf8");
		if (existingAuthKeys.includes(publicKey)) {
			return privateKey;
		}

		// Append the public key to authorized_keys
		fs.appendFileSync(AUTHORIZED_KEYS_PATH, authKeyContent, {
			mode: 0o600,
		});

		return privateKey;
	} catch (error) {
		console.error("Error getting private SSH key for local terminal:", error);
		return "";
	}
};
