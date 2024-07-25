import * as fs from "node:fs";
import * as path from "node:path";
import { SSH_PATH } from "@/server/constants";
import { spawnAsync } from "../process/spawnAsync";

export const saveSSHKey = async (
	id: string,
	publicKey: string,
	privateKey: string,
) => {
	const applicationDirectory = SSH_PATH;

	const privateKeyPath = path.join(applicationDirectory, `${id}_rsa`);
	const publicKeyPath = path.join(applicationDirectory, `${id}_rsa.pub`);

	const privateKeyStream = fs.createWriteStream(privateKeyPath, {
		mode: 0o400,
	});
	privateKeyStream.write(privateKey);
	privateKeyStream.end();

	const publicKeyStream = fs.createWriteStream(publicKeyPath, { mode: 0o400 });
	publicKeyStream.write(publicKey);
	publicKeyStream.end();
};

export const generateSSHKey = async (id: string) => {
	const applicationDirectory = SSH_PATH;

	if (!fs.existsSync(applicationDirectory)) {
		fs.mkdirSync(applicationDirectory, { recursive: true });
	}

	const keyPath = path.join(applicationDirectory, `${id}_rsa`);

	if (fs.existsSync(`${keyPath}`)) {
		fs.unlinkSync(`${keyPath}`);
	}
	if (fs.existsSync(`${keyPath}.pub`)) {
		fs.unlinkSync(`${keyPath}.pub`);
	}
	const args = [
		"-t",
		"rsa",
		"-b",
		"4096",
		"-C",
		"dokploy",
		"-f",
		keyPath,
		"-N",
		"",
	];
	try {
		await spawnAsync("ssh-keygen", args);
		return keyPath;
	} catch (error) {
		throw error;
	}
};
export const readSSHPublicKey = async (id: string) => {
	try {
		if (!fs.existsSync(SSH_PATH)) {
			fs.mkdirSync(SSH_PATH, { recursive: true });
		}
		const keyPath = path.join(SSH_PATH, `${id}_rsa.pub`);
		const data = fs.readFileSync(keyPath, { encoding: "utf-8" });
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
