import { randomBytes } from "node:crypto";
import type { Domain } from "@dokploy/server";

export interface Schema {
	serverIp: string;
	projectName: string;
}

export type DomainSchema = Pick<Domain, "host" | "port" | "serviceName"> & {
	path?: string;
};

export interface Template {
	envs?: string[];
	mounts?: {
		filePath: string;
		content?: string;
	}[];
	domains?: DomainSchema[];
}

export const generateRandomDomain = ({
	serverIp,
	projectName,
}: {
	serverIp: string;
	projectName: string;
}): string => {
	const hash = randomBytes(3).toString("hex");
	const slugIp = serverIp.replaceAll(".", "-");

	return `${projectName}-${hash}${slugIp === "" ? "" : `-${slugIp}`}.traefik.me`;
};

export const generateHash = (projectName: string, quantity = 3): string => {
	const hash = randomBytes(quantity).toString("hex");
	return `${projectName}-${hash}`;
};

export const generatePassword = (quantity = 16): string => {
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let password = "";
	for (let i = 0; i < quantity; i++) {
		password += characters.charAt(
			Math.floor(Math.random() * characters.length),
		);
	}
	return password.toLowerCase();
};

export const generateBase64 = (bytes = 32): string => {
	return randomBytes(bytes).toString("base64");
};
