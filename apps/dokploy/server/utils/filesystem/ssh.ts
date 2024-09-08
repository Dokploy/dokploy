import * as fs from "node:fs";
import * as path from "node:path";
import { SSH_PATH } from "@/server/constants";
import { spawnAsync } from "../process/spawnAsync";

export const readSSHKey = async (id: string) => {
	try {
		if (!fs.existsSync(SSH_PATH)) {
			fs.mkdirSync(SSH_PATH, { recursive: true });
		}

		return {
			privateKey: fs.readFileSync(path.join(SSH_PATH, `${id}_rsa`), {
				encoding: "utf-8",
			}),
			publicKey: fs.readFileSync(path.join(SSH_PATH, `${id}_rsa.pub`), {
				encoding: "utf-8",
			}),
		};
	} catch (error) {
		throw error;
	}
};

export const saveSSHKey = async (
	id: string,
	publicKey: string,
	privateKey: string,
) => {
	const applicationDirectory = SSH_PATH;

	const privateKeyPath = path.join(applicationDirectory, `${id}_rsa`);
	const publicKeyPath = path.join(applicationDirectory, `${id}_rsa.pub`);

	const privateKeyStream = fs.createWriteStream(privateKeyPath, {
		mode: 0o600,
	});
	privateKeyStream.write(privateKey);
	privateKeyStream.end();

	fs.writeFileSync(publicKeyPath, publicKey);
};

export const generateSSHKey = async (type: "rsa" | "ed25519" = "rsa") => {
	const applicationDirectory = SSH_PATH;

	if (!fs.existsSync(applicationDirectory)) {
		fs.mkdirSync(applicationDirectory, { recursive: true });
	}

	const keyPath = path.join(applicationDirectory, "temp_rsa");

	if (fs.existsSync(`${keyPath}`)) {
		fs.unlinkSync(`${keyPath}`);
	}

	if (fs.existsSync(`${keyPath}.pub`)) {
		fs.unlinkSync(`${keyPath}.pub`);
	}

	const args = [
		"-t",
		type,
		"-b",
		"4096",
		"-C",
		"dokploy",
		"-m",
		"PEM",
		"-f",
		keyPath,
		"-N",
		"",
	];

	try {
		await spawnAsync("ssh-keygen", args);
		const data = await readSSHKey("temp");
		await removeSSHKey("temp");
		return data;
	} catch (error) {
		throw error;
	}
};

export const removeSSHKey = async (id: string) => {
	try {
		const publicKeyPath = path.join(SSH_PATH, `${id}_rsa.pub`);
		const privateKeyPath = path.join(SSH_PATH, `${id}_rsa`);
		await fs.promises.unlink(publicKeyPath);
		await fs.promises.unlink(privateKeyPath);
	} catch (error) {
		throw error;
	}
};
