import * as fs from "node:fs";
import * as path from "node:path";
import { SSH_PATH } from "@/server/constants";
import { spawnAsync } from "../process/spawnAsync";

export const generateSSHKey = async (appName: string) => {
	const applicationDirectory = SSH_PATH;

	if (!fs.existsSync(applicationDirectory)) {
		fs.mkdirSync(applicationDirectory, { recursive: true });
	}

	const keyPath = path.join(applicationDirectory, `${appName}_rsa`);

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
export const readRSAFile = async (appName: string) => {
	try {
		if (!fs.existsSync(SSH_PATH)) {
			fs.mkdirSync(SSH_PATH, { recursive: true });
		}
		const keyPath = path.join(SSH_PATH, `${appName}_rsa.pub`);
		const data = fs.readFileSync(keyPath, { encoding: "utf-8" });
		return data;
	} catch (error) {
		throw error;
	}
};

export const removeRSAFiles = async (appName: string) => {
	try {
		const publicKeyPath = path.join(SSH_PATH, `${appName}_rsa.pub`);
		const privateKeyPath = path.join(SSH_PATH, `${appName}_rsa`);
		await fs.promises.unlink(publicKeyPath);
		await fs.promises.unlink(privateKeyPath);
	} catch (error) {
		throw error;
	}
};
