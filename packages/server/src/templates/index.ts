import { createHmac, randomBytes, randomInt } from "node:crypto";
import type { Domain } from "@dokploy/server/services/domain";

export interface Schema {
	serverIp: string;
	projectName: string;
}

export type DomainSchema = Pick<Domain, "host" | "port" | "serviceName"> & {
	path?: string;
};

export interface Template {
	envs: string[];
	mounts: Array<{
		filePath: string;
		content: string;
	}>;
	domains: DomainSchema[];
}

export interface GenerateJWTOptions {
	length?: number;
	secret?: string;
	payload?: Record<string, unknown> | undefined;
}

export const generateRandomDomain = ({
	serverIp,
	projectName,
}: Schema): string => {
	const hash = randomBytes(3).toString("hex");
	const effectiveIp = serverIp || "127.0.0.1";
	const slugIp = effectiveIp.replaceAll(".", "-").replaceAll(":", "-");

	// Domain labels have a max length of 63 characters
	// Reserve space for: hash (6) + separators (1-2) + ip section + dot + sslip.io (8)
	// Approx: 6 + 2 + (variable ip length) + 9 = ~19-30 chars for other parts
	const maxProjectNameLength = 40;
	const truncatedProjectName =
		projectName.length > maxProjectNameLength
			? projectName.substring(0, maxProjectNameLength)
			: projectName;

	return `${truncatedProjectName}-${hash}-${slugIp}.sslip.io`;
};

export const generateHash = (length = 8): string => {
	return randomBytes(Math.ceil(length / 2))
		.toString("hex")
		.substring(0, length);
};

export const generatePassword = (quantity = 16): string => {
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let password = "";
	for (let i = 0; i < quantity; i++) {
		password += characters.charAt(randomInt(characters.length));
	}
	return password.toLowerCase();
};

/**
 * Generate a random base64 string from N random bytes
 * @param bytes Number of random bytes to generate before base64 encoding (default: 32)
 * @returns base64 encoded string of the random bytes
 */
export function generateBase64(bytes = 32): string {
	return randomBytes(bytes).toString("base64");
}

function safeBase64(str: string): string {
	return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function objToJWTBase64(obj: any): string {
	return safeBase64(
		Buffer.from(JSON.stringify(obj), "utf8").toString("base64"),
	);
}

export function generateJwt(options: GenerateJWTOptions = {}): string {
	let { length, secret, payload = {} } = options;
	if (length) {
		return randomBytes(length).toString("hex");
	}
	const encodedHeader = objToJWTBase64({
		alg: "HS256",
		typ: "JWT",
	});
	if (!payload.iss) {
		payload.iss = "dokploy";
	}
	if (!payload.iat) {
		payload.iat = Math.floor(Date.now() / 1000);
	}
	if (!payload.exp) {
		payload.exp = Math.floor(new Date("2030-01-01T00:00:00Z").getTime() / 1000);
	}
	const encodedPayload = objToJWTBase64({
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(new Date("2030-01-01T00:00:00Z").getTime() / 1000),
		...payload,
	});
	if (!secret) {
		secret = randomBytes(32).toString("hex");
	}
	const signature = safeBase64(
		createHmac("SHA256", secret)
			.update(`${encodedHeader}.${encodedPayload}`)
			.digest("base64"),
	);

	return `${encodedHeader}.${encodedPayload}.${signature}`;
}
