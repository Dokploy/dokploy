import { parse } from "toml";

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

interface TemplateMetadata {
	id: string;
	name: string;
	description: string;
	version: string;
	logo: string;
	links: {
		github: string;
		website?: string;
		docs?: string;
	};
	tags: string[];
}

/**
 * Fetches the list of available templates from meta.json
 */
export async function fetchTemplatesList(
	baseUrl = "https://templates.dokploy.com",
): Promise<TemplateMetadata[]> {
	try {
		const response = await fetch(`${baseUrl}/meta.json`);
		if (!response.ok) {
			throw new Error(`Failed to fetch templates: ${response.statusText}`);
		}
		const templates = (await response.json()) as TemplateMetadata[];
		return templates.map((template) => ({
			id: template.id,
			name: template.name,
			description: template.description,
			version: template.version,
			logo: template.logo,
			links: template.links,
			tags: template.tags,
		}));
	} catch (error) {
		console.error("Error fetching templates list:", error);
		throw error;
	}
}

/**
 * Fetches a specific template's files
 */
export async function fetchTemplateFiles(
	templateId: string,
	baseUrl = "https://templates.dokploy.com",
): Promise<{ config: CompleteTemplate; dockerCompose: string }> {
	try {
		// Fetch both files in parallel
		const [templateYmlResponse, dockerComposeResponse] = await Promise.all([
			fetch(`${baseUrl}/blueprints/${templateId}/template.toml`),
			fetch(`${baseUrl}/blueprints/${templateId}/docker-compose.yml`),
		]);

		if (!templateYmlResponse.ok || !dockerComposeResponse.ok) {
			throw new Error("Template files not found");
		}

		const [templateYml, dockerCompose] = await Promise.all([
			templateYmlResponse.text(),
			dockerComposeResponse.text(),
		]);

		const config = parse(templateYml) as CompleteTemplate;

		return { config, dockerCompose };
	} catch (error) {
		console.error(`Error fetching template ${templateId}:`, error);
		throw error;
	}
}
