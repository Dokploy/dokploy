import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";
import * as esbuild from "esbuild";
import { load } from "js-yaml";
import { templateConfig } from "../config";
import type { Template } from "./index";
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
 * Interface for template metadata
 */
export interface TemplateMetadata {
	id: string;
	name: string;
	version: string;
	description: string;
	logo: string;
	links: {
		github?: string;
		website?: string;
		docs?: string;
	};
	tags: string[];
}

/**
 * Fetches the list of available templates from GitHub
 */
export async function fetchTemplatesList(
	owner = templateConfig.owner,
	repo = templateConfig.repo,
	branch = templateConfig.branch,
): Promise<TemplateMetadata[]> {
	try {
		// Fetch templates directory content
		const { data: dirContent } = await octokit.repos.getContent({
			owner,
			repo,
			path: "templates",
			ref: branch,
		});

		console.log("DIR CONTENT", dirContent);

		if (!Array.isArray(dirContent)) {
			throw new Error("Templates directory not found or is not a directory");
		}

		// Filter for directories only (each directory is a template)
		const templateDirs = dirContent.filter((item) => item.type === "dir");

		// Fetch metadata for each template
		const templates = await Promise.all(
			templateDirs.map(async (dir) => {
				try {
					// Try to fetch metadata.json for each template
					const { data: metadataFile } = await octokit.repos.getContent({
						owner,
						repo,
						path: `templates/${dir.name}/metadata.json`,
						ref: branch,
					});

					if ("content" in metadataFile && metadataFile.encoding === "base64") {
						const content = Buffer.from(
							metadataFile.content,
							"base64",
						).toString();
						return JSON.parse(content) as TemplateMetadata;
					}
				} catch (error) {
					// If metadata.json doesn't exist, create a basic metadata object
					return {
						id: dir.name,
						name: dir.name.charAt(0).toUpperCase() + dir.name.slice(1),
						version: "latest",
						description: `${dir.name} template`,
						logo: "default.svg",
						links: {},
						tags: [],
					};
				}

				return null;
			}),
		);

		return templates.filter(Boolean) as TemplateMetadata[];
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
): Promise<{ indexTs: string; dockerCompose: string }> {
	try {
		// Fetch index.ts
		const { data: indexFile } = await octokit.repos.getContent({
			owner,
			repo,
			path: `templates/${templateId}/index.ts`,
			ref: branch,
		});

		// Fetch docker-compose.yml
		const { data: composeFile } = await octokit.repos.getContent({
			owner,
			repo,
			path: `templates/${templateId}/docker-compose.yml`,
			ref: branch,
		});

		if (!("content" in indexFile) || !("content" in composeFile)) {
			throw new Error("Template files not found");
		}

		const indexTs = Buffer.from(indexFile.content, "base64").toString();
		const dockerCompose = Buffer.from(composeFile.content, "base64").toString();

		return { indexTs, dockerCompose };
	} catch (error) {
		console.error(`Error fetching template ${templateId}:`, error);
		throw error;
	}
}

/**
 * Executes the template's index.ts code dynamically
 * Uses a template-based approach that's safer and more efficient
 */
export async function executeTemplateCode(
	indexTsCode: string,
	schema: { serverIp: string; projectName: string },
): Promise<Template> {
	try {
		// Create a temporary directory for the template
		const cwd = process.cwd();
		const tempId = randomBytes(8).toString("hex");
		const tempDir = join(cwd, ".next", "temp", tempId);

		if (!existsSync(tempDir)) {
			await mkdir(tempDir, { recursive: true });
		}

		// Extract the generate function body
		// This approach assumes templates follow a standard structure with a generate function
		const generateFunctionMatch = indexTsCode.match(
			/export\s+function\s+generate\s*\([^)]*\)\s*{([\s\S]*?)return\s+{([\s\S]*?)};?\s*}/,
		);

		if (!generateFunctionMatch) {
			throw new Error("Could not extract generate function from template");
		}

		const functionBody = generateFunctionMatch[1];
		const returnStatement = generateFunctionMatch[2];

		// Create a simplified template that doesn't require imports
		const templateCode = `
			// Utility functions provided to the template
			function generateRandomDomain(schema) {
				const hash = Math.random().toString(36).substring(2, 8);
				const slugIp = schema.serverIp.replaceAll(".", "-");
				return \`\${schema.projectName}-\${hash}\${slugIp === "" ? "" : \`-\${slugIp}\`}.traefik.me\`;
			}
			
			function generateHash(projectName, quantity = 3) {
				const hash = Math.random().toString(36).substring(2, 2 + quantity);
				return \`\${projectName}-\${hash}\`;
			}
			
			function generatePassword(quantity = 16) {
				const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
				let password = "";
				for (let i = 0; i < quantity; i++) {
					password += characters.charAt(Math.floor(Math.random() * characters.length));
				}
				return password.toLowerCase();
			}
			
			function generateBase64(bytes = 32) {
				return Math.random().toString(36).substring(2, 2 + bytes);
			}
			
			// Template execution
			function execute(schema) {
				${functionBody}
				return {
					${returnStatement}
				};
			}
			
			// Run with the provided schema and output the result
			const result = execute(${JSON.stringify(schema)});
			console.log(JSON.stringify(result));
		`;

		// Write the template code to a file
		const templatePath = join(tempDir, "template.js");
		await writeFile(templatePath, templateCode, "utf8");

		// Execute the template using Node.js
		const output = execSync(`node ${templatePath}`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		// Parse the output as JSON
		return JSON.parse(output);
	} catch (error) {
		console.error("Error executing template code:", error);

		// Fallback to a simpler approach if the template extraction fails
		return fallbackExecuteTemplate(indexTsCode, schema);
	}
}

/**
 * Fallback method to execute templates that don't follow the standard structure
 */
async function fallbackExecuteTemplate(
	indexTsCode: string,
	schema: { serverIp: string; projectName: string },
): Promise<Template> {
	try {
		// Create a temporary directory
		const cwd = process.cwd();
		const tempId = randomBytes(8).toString("hex");
		const tempDir = join(cwd, ".next", "temp", tempId);

		if (!existsSync(tempDir)) {
			await mkdir(tempDir, { recursive: true });
		}

		// Create a simplified version of the template code
		// Remove TypeScript types and imports
		const simplifiedCode = indexTsCode
			.replace(/import\s+.*?from\s+['"].*?['"]\s*;?/g, "")
			.replace(/export\s+interface\s+.*?{[\s\S]*?}/g, "")
			.replace(/:\s*Schema/g, "")
			.replace(/:\s*DomainSchema/g, "")
			.replace(/:\s*Template/g, "")
			.replace(/:\s*string/g, "")
			.replace(/:\s*number/g, "")
			.replace(/:\s*boolean/g, "")
			.replace(/:\s*any/g, "")
			.replace(/:\s*unknown/g, "")
			.replace(/<.*?>/g, "");

		// Create a wrapper with all necessary utilities
		const wrapperCode = `
			// Utility functions
			function generateRandomDomain(schema) {
				const hash = Math.random().toString(36).substring(2, 8);
				const slugIp = schema.serverIp.replaceAll(".", "-");
				return \`\${schema.projectName}-\${hash}\${slugIp === "" ? "" : \`-\${slugIp}\`}.traefik.me\`;
			}
			
			function generateHash(projectName, quantity = 3) {
				const hash = Math.random().toString(36).substring(2, 2 + quantity);
				return \`\${projectName}-\${hash}\`;
			}
			
			function generatePassword(quantity = 16) {
				const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
				let password = "";
				for (let i = 0; i < quantity; i++) {
					password += characters.charAt(Math.floor(Math.random() * characters.length));
				}
				return password.toLowerCase();
			}
			
			function generateBase64(bytes = 32) {
				return Math.random().toString(36).substring(2, 2 + bytes);
			}
			
			// Simplified template code
			${simplifiedCode}
			
			// Execute the template
			const result = generate(${JSON.stringify(schema)});
			console.log(JSON.stringify(result));
		`;

		// Write the wrapper code to a file
		const wrapperPath = join(tempDir, "wrapper.js");
		await writeFile(wrapperPath, wrapperCode, "utf8");

		// Execute the code using Node.js
		const output = execSync(`node ${wrapperPath}`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		// Parse the output as JSON
		return JSON.parse(output);
	} catch (error) {
		console.error("Error in fallback template execution:", error);
		throw new Error(
			`Failed to execute template: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
