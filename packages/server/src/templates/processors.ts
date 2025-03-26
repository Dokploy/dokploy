import type { Schema } from "./index";
import {
	generateBase64,
	generateHash,
	generateJwt,
	generatePassword,
	generateRandomDomain,
} from "./index";

/**
 * Domain configuration
 */
interface DomainConfig {
	serviceName: string;
	port: number;
	path?: string;
	host?: string;
}

/**
 * Mount configuration
 */
interface MountConfig {
	filePath: string;
	content: string;
}

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
	variables: Record<string, string>;
	config: {
		domains: DomainConfig[];
		env: Record<string, string> | string[];
		mounts?: MountConfig[];
	};
}

/**
 * Processed template output
 */
export interface Template {
	domains: Array<DomainConfig>;
	envs: string[];
	mounts: MountConfig[];
}

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
		if (varName === "domain") {
			return generateRandomDomain(schema);
		}

		if (varName === "base64") {
			return generateBase64(32);
		}
		if (varName.startsWith("base64:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 32;
			return generateBase64(length);
		}
		if (varName.startsWith("password:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 16;
			return generatePassword(length);
		}

		if (varName === "password") {
			return generatePassword(16);
		}

		if (varName.startsWith("hash:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 8;
			return generateHash(length);
		}
		if (varName === "uuid") {
			return crypto.randomUUID();
		}

		if (varName === "timestamp") {
			return Date.now().toString();
		}

		if (varName === "randomPort") {
			return Math.floor(Math.random() * 65535).toString();
		}

		if (varName === "jwt") {
			return generateJwt();
		}

		if (varName.startsWith("jwt:")) {
			const length = Number.parseInt(varName.split(":")[1], 10) || 256;
			return generateJwt(length);
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
 * Process variables in a template
 */
export function processVariables(
	template: CompleteTemplate,
	schema: Schema,
): Record<string, string> {
	const variables: Record<string, string> = {};

	// First pass: Process variables that don't depend on other variables
	for (const [key, value] of Object.entries(template.variables)) {
		if (typeof value !== "string") continue;

		if (value === "${domain}") {
			variables[key] = generateRandomDomain(schema);
		} else if (value.startsWith("${base64:")) {
			const match = value.match(/\${base64:(\d+)}/);
			const length = match?.[1] ? Number.parseInt(match[1], 10) : 32;
			variables[key] = generateBase64(length);
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

	// Second pass: Process variables that reference other variables
	for (const [key, value] of Object.entries(variables)) {
		variables[key] = processValue(value, variables, schema);
	}

	return variables;
}

/**
 * Process domains in a template
 */
export function processDomains(
	template: CompleteTemplate,
	variables: Record<string, string>,
	schema: Schema,
): Template["domains"] {
	if (!template?.config?.domains) return [];
	return template?.config?.domains?.map((domain: DomainConfig) => ({
		...domain,
		host: domain.host
			? processValue(domain.host, variables, schema)
			: generateRandomDomain(schema),
	}));
}

/**
 * Process environment variables in a template
 */
export function processEnvVars(
	template: CompleteTemplate,
	variables: Record<string, string>,
	schema: Schema,
): Template["envs"] {
	if (!template?.config?.env) return [];

	// Handle array of env vars
	if (Array.isArray(template.config.env)) {
		return template.config.env.map((env) => {
			if (typeof env === "string") {
				return processValue(env, variables, schema);
			}
			return env;
		});
	}

	// Handle object of env vars
	return Object.entries(template.config.env).map(([key, value]) => {
		if (typeof value === "string") {
			const processedValue = processValue(value, variables, schema);
			return `${key}=${processedValue}`;
		}
		return `${key}=${value}`;
	});
}

/**
 * Process mounts in a template
 */
export function processMounts(
	template: CompleteTemplate,
	variables: Record<string, string>,
	schema: Schema,
): Template["mounts"] {
	if (!template?.config?.mounts) return [];

	return template?.config?.mounts?.map((mount: MountConfig) => ({
		filePath: processValue(mount.filePath, variables, schema),
		content: processValue(mount.content, variables, schema),
	}));
}

/**
 * Process a complete template
 */
export function processTemplate(
	template: CompleteTemplate,
	schema: Schema,
): Template {
	// First process variables as they might be referenced by other sections
	const variables = processVariables(template, schema);

	return {
		domains: processDomains(template, variables, schema),
		envs: processEnvVars(template, variables, schema),
		mounts: processMounts(template, variables, schema),
	};
}
