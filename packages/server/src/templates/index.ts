import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Domain } from "@dokploy/server/services/domain";
import { TRPCError } from "@trpc/server";
import { fetchTemplateFiles } from "./github";

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
	const slugIp = serverIp.replaceAll(".", "-").replaceAll(":", "-");

	return `${projectName}-${hash}${slugIp === "" ? "" : `-${slugIp}`}.traefik.me`;
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
		password += characters.charAt(
			Math.floor(Math.random() * characters.length),
		);
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

/**
 * Reads a template's docker-compose.yml file
 * First tries to fetch from GitHub, falls back to local cache if fetch fails
 */
export const readTemplateComposeFile = async (id: string) => {
	// First try to fetch from GitHub
	try {
		const { dockerCompose } = await fetchTemplateFiles(id);

		// Cache the file for future use
		const cwd = process.cwd();
		const templatePath = join(cwd, ".next", "templates", id);
		const composeFilePath = join(templatePath, "docker-compose.yml");

		// Ensure the template directory exists
		if (!existsSync(templatePath)) {
			await mkdir(templatePath, { recursive: true });
		}

		// Cache the file for future use
		await writeFile(composeFilePath, dockerCompose, "utf8");

		return dockerCompose;
	} catch (error) {
		console.warn(`Failed to fetch template ${id} from GitHub:`, error);

		// Try to use cached version as fallback
		const cwd = process.cwd();
		const composeFilePath = join(
			cwd,
			".next",
			"templates",
			id,
			"docker-compose.yml",
		);

		if (existsSync(composeFilePath)) {
			console.warn(`Using cached version of template ${id}`);
			return await readFile(composeFilePath, "utf8");
		}

		console.error(`Error: Template ${id} not found in GitHub or cache`);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Template ${id} not found or could not be fetched`,
		});
	}
};

/**
 * Loads a template module from GitHub or local cache
 * First tries to fetch from GitHub, falls back to local cache if fetch fails
 */
