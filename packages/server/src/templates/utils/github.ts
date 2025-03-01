import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import { load } from "js-yaml";
import { templateConfig } from "../config";
import type { Schema, Template, DomainSchema } from "./index";
import {
	generateBase64,
	generateHash,
	generatePassword,
	generateRandomDomain,
} from "./index";

// GitHub API client
const octokit = new Octokit({
	auth: templateConfig.token,
});

/**
 * Complete template interface that includes both metadata and configuration
 */
export interface CompleteTemplate {
	metadata: {
		id: string;
		name: string;
		description: string;
		tags: string[];
		version: string;
		logo: string;
		links: {
			github: string;
			website?: string;
			docs?: string;
		};
	};
	variables: {
		[key: string]: string;
	};
	config: {
		domains: Array<{
			serviceName: string;
			port: number;
			path?: string;
			host?: string;
		}>;
		env: Record<string, string>;
		mounts?: Array<{
			filePath: string;
			content: string;
		}>;
	};
}

/**
 * Utility functions that can be used in template values
 */
const TEMPLATE_FUNCTIONS = {
	$randomDomain: () => true,
	$password: (length = 16) => `$password(${length})`,
	$base64: (bytes = 32) => `$base64(${bytes})`,
	$base32: (bytes = 32) => `$base32(${bytes})`,
	$hash: (length = 8) => `$hash(${length})`,
} as const;

/**
 * Process a string value and replace variables
 */
function processValue(
	value: string,
	variables: Record<string, string>,
	schema: Schema,
): string {
	// First replace utility functions
	let processedValue = value.replace(/\${([^}]+)}/g, (match, varName) => {
		// Handle utility functions
		if (varName === "randomDomain") {
			return generateRandomDomain(schema);
		}
		if (varName.startsWith("base64:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 32;
			return generateBase64(length);
		}
		if (varName.startsWith("base32:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 32;
			return Buffer.from(randomBytes(length))
				.toString("base64")
				.substring(0, length);
		}
		if (varName.startsWith("password:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 16;
			return generatePassword(length);
		}
		if (varName.startsWith("hash:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 8;
			return generateHash(length);
		}
		// If not a utility function, try to get from variables
		return variables[varName] || match;
	});

	// Then replace any remaining ${var} with their values from variables
	processedValue = processedValue.replace(/\${([^}]+)}/g, (match, varName) => {
		return variables[varName] || match;
	});

	return processedValue;
}

/**
 * Processes a template configuration and returns the generated template
 */
export function processTemplate(
	config: CompleteTemplate,
	schema: Schema,
): Template {
	const result: Template = {
		envs: [],
		domains: [],
		mounts: [],
	};

	// First pass: Process variables that don't depend on domains
	const variables: Record<string, string> = {};
	for (const [key, value] of Object.entries(config.variables)) {
		if (value === "${randomDomain}") {
			variables[key] = generateRandomDomain(schema);
		} else if (value.startsWith("${base64:")) {
			const match = value.match(/\${base64:(\d+)}/);
			const length = match?.[1] ? Number.parseInt(match[1], 10) : 32;
			variables[key] = generateBase64(length);
		} else if (value.startsWith("${base32:")) {
			const match = value.match(/\${base32:(\d+)}/);
			const length = match?.[1] ? Number.parseInt(match[1], 10) : 32;
			variables[key] = Buffer.from(randomBytes(length))
				.toString("base64")
				.substring(0, length);
		} else if (value.startsWith("${password:")) {
			const match = value.match(/\${password:(\d+)}/);
			const length = match?.[1] ? Number.parseInt(match[1], 10) : 16;
			variables[key] = generatePassword(length);
		} else if (value.startsWith("${hash:")) {
			const match = value.match(/\${hash:(\d+)}/);
			const length = match?.[1] ? Number.parseInt(match[1], 10) : 8;
			variables[key] = generateHash(length);
		} else {
			variables[key] = value;
		}
	}

	console.log(variables);

	// Process domains and add them to variables
	for (const domain of config.config.domains) {
		// If host is specified, process it with variables, otherwise generate random domain
		const host = domain.host
			? processValue(domain.host, variables, schema)
			: generateRandomDomain(schema);

		result.domains.push({
			host,
			...domain,
		});
		// Add domain to variables for reference
		variables[`domain:${domain.serviceName}`] = host;
	}

	// Process environment variables with access to all variables
	for (const [key, value] of Object.entries(config.config.env)) {
		const processedValue = processValue(value, variables, schema);
		result.envs.push(`${key}=${processedValue}`);
	}

	// Process mounts with access to all variables
	if (config.config.mounts) {
		for (const mount of config.config.mounts) {
			result.mounts.push({
				filePath: mount.filePath,
				content: processValue(mount.content, variables, schema),
			});
		}
	}

	return result;
}

/**
 * GitHub tree item with required fields
 */
interface GitTreeItem {
	path: string;
	type: string;
	sha: string;
}

/**
 * Fetches the list of available templates from GitHub
 */
export async function fetchTemplatesList(
	owner = templateConfig.owner,
	repo = templateConfig.repo,
	branch = templateConfig.branch,
): Promise<CompleteTemplate[]> {
	try {
		// First get the tree SHA for the branch
		const { data: ref } = await octokit.git.getRef({
			owner,
			repo,
			ref: `heads/${branch}`,
		});

		// Get the full tree recursively
		const { data: tree } = await octokit.git.getTree({
			owner,
			repo,
			tree_sha: ref.object.sha,
			recursive: "true",
		});

		// Filter for template.yml files in the templates directory
		const templateFiles = tree.tree.filter((item): item is GitTreeItem => {
			return (
				item.type === "blob" &&
				typeof item.path === "string" &&
				typeof item.sha === "string" &&
				item.path.startsWith("templates/") &&
				item.path.endsWith("/template.yml")
			);
		});

		// Fetch and parse each template.yml
		const templates = await Promise.all(
			templateFiles.map(async (file) => {
				try {
					const { data: content } = await octokit.git.getBlob({
						owner,
						repo,
						file_sha: file.sha,
					});

					const decoded = Buffer.from(content.content, "base64").toString();
					return load(decoded) as CompleteTemplate;
				} catch (error) {
					console.warn(`Failed to load template from ${file.path}:`, error);
					return null;
				}
			}),
		);

		return templates.filter(Boolean) as CompleteTemplate[];
	} catch (error) {
		console.error("Error fetching templates list:", error);
		throw error;
	}
}

/**
 * Fetches a specific template's files from GitHub
 */
export async function fetchTemplateFiles(
	templateId: string,
	owner = templateConfig.owner,
	repo = templateConfig.repo,
	branch = templateConfig.branch,
): Promise<{ config: CompleteTemplate; dockerCompose: string }> {
	try {
		// Get the tree SHA for the branch
		const { data: ref } = await octokit.git.getRef({
			owner,
			repo,
			ref: `heads/${branch}`,
		});

		// Get the full tree recursively
		const { data: tree } = await octokit.git.getTree({
			owner,
			repo,
			tree_sha: ref.object.sha,
			recursive: "true",
		});

		// Find the template.yml and docker-compose.yml files
		const templateYml = tree.tree
			.filter((item): item is GitTreeItem => {
				return (
					item.type === "blob" &&
					typeof item.path === "string" &&
					typeof item.sha === "string"
				);
			})
			.find((item) => item.path === `templates/${templateId}/template.yml`);

		const dockerComposeYml = tree.tree
			.filter((item): item is GitTreeItem => {
				return (
					item.type === "blob" &&
					typeof item.path === "string" &&
					typeof item.sha === "string"
				);
			})
			.find(
				(item) => item.path === `templates/${templateId}/docker-compose.yml`,
			);

		if (!templateYml || !dockerComposeYml) {
			throw new Error("Template files not found");
		}

		// Fetch both files in parallel
		const [templateContent, composeContent] = await Promise.all([
			octokit.git.getBlob({
				owner,
				repo,
				file_sha: templateYml.sha,
			}),
			octokit.git.getBlob({
				owner,
				repo,
				file_sha: dockerComposeYml.sha,
			}),
		]);

		const config = load(
			Buffer.from(templateContent.data.content, "base64").toString(),
		) as CompleteTemplate;
		const dockerCompose = Buffer.from(
			composeContent.data.content,
			"base64",
		).toString();

		return { config, dockerCompose };
	} catch (error) {
		console.error(`Error fetching template ${templateId}:`, error);
		throw error;
	}
}

/**
 * Loads and processes a template
 */
export async function loadTemplateModule(
	id: string,
): Promise<(schema: Schema) => Promise<Template>> {
	const { config } = await fetchTemplateFiles(id);
	return async (schema: Schema) => processTemplate(config, schema);
}
