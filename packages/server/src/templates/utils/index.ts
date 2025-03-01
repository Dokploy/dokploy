import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Domain } from "@dokploy/server/services/domain";
import { TRPCError } from "@trpc/server";
import { templateConfig } from "../config";
import { executeTemplateCode, fetchTemplateFiles } from "./github";

export interface Schema {
	serverIp: string;
	projectName: string;
}

export type DomainSchema = Pick<Domain, "host" | "port" | "serviceName">;

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
}: Schema): string => {
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

/**
 * Checks if a cached file is still valid based on its modification time
 */
async function isCacheValid(filePath: string): Promise<boolean> {
	try {
		if (!existsSync(filePath)) return false;

		const fileStats = await stat(filePath);
		const modifiedTime = fileStats.mtime.getTime();
		const currentTime = Date.now();

		// Check if the file is older than the cache duration
		return currentTime - modifiedTime < templateConfig.cacheDuration;
	} catch (error) {
		return false;
	}
}

/**
 * Reads a template's docker-compose.yml file
 * First tries to read from the local cache, if not found or expired, fetches from GitHub
 */
export const readTemplateComposeFile = async (id: string) => {
	const cwd = process.cwd();
	const templatePath = join(cwd, ".next", "templates", id);
	const composeFilePath = join(templatePath, "docker-compose.yml");

	// Check if the file exists in the local cache and is still valid
	if (await isCacheValid(composeFilePath)) {
		return await readFile(composeFilePath, "utf8");
	}

	// If not in cache or expired, fetch from GitHub and cache it
	try {
		const { dockerCompose } = await fetchTemplateFiles(id);

		// Ensure the template directory exists
		if (!existsSync(templatePath)) {
			await mkdir(templatePath, { recursive: true });
		}

		// Cache the file for future use
		await writeFile(composeFilePath, dockerCompose, "utf8");

		return dockerCompose;
	} catch (error) {
		// If fetch fails but we have a cached version, use it as fallback
		if (existsSync(composeFilePath)) {
			console.warn(
				`Using cached version of template ${id} due to fetch error:`,
				error,
			);
			return await readFile(composeFilePath, "utf8");
		}

		console.error(`Error fetching template ${id}:`, error);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Template ${id} not found or could not be fetched`,
		});
	}
};

/**
 * Loads a template module and returns its generate function
 * First tries to execute from local cache, if not found or expired, fetches from GitHub
 */
export const loadTemplateModule = async (id: string) => {
	const cwd = process.cwd();
	const templatePath = join(cwd, ".next", "templates", id);
	const indexFilePath = join(templatePath, "index.ts");

	// Check if we have the template cached locally and it's still valid
	if (await isCacheValid(indexFilePath)) {
		const indexTs = await readFile(indexFilePath, "utf8");
		return (schema: Schema) => executeTemplateCode(indexTs, schema);
	}

	// If not in cache or expired, fetch from GitHub and cache it
	try {
		const { indexTs } = await fetchTemplateFiles(id);

		// Ensure the template directory exists
		if (!existsSync(templatePath)) {
			await mkdir(templatePath, { recursive: true });
		}

		// Cache the file for future use
		await writeFile(indexFilePath, indexTs, "utf8");

		// Return a function that will execute the template code
		return (schema: Schema) => executeTemplateCode(indexTs, schema);
	} catch (error) {
		// If fetch fails but we have a cached version, use it as fallback
		if (existsSync(indexFilePath)) {
			console.warn(
				`Using cached version of template ${id} due to fetch error:`,
				error,
			);
			const indexTs = await readFile(indexFilePath, "utf8");
			return (schema: Schema) => executeTemplateCode(indexTs, schema);
		}

		console.error(`Error loading template module ${id}:`, error);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Template ${id} not found or could not be loaded`,
		});
	}
};
