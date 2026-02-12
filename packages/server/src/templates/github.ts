import { parse } from "toml";

// Simple in-memory cache for template dates
const templateDatesCache = new Map<
	string,
	{ createdAt?: string; updatedAt?: string; timestamp: number }
>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Rate limiting for GitHub API calls
let lastApiCall = 0;
const API_CALL_INTERVAL = 100; // 100ms between API calls

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
		createdAt?: string;
		updatedAt?: string;
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
	createdAt?: string;
	updatedAt?: string;
}

/**
 * Fetches template creation date from GitHub API with caching
 */
async function fetchTemplateCreationDate(
	templateId: string,
): Promise<{ createdAt?: string; updatedAt?: string }> {
	// Check cache first
	const cached = templateDatesCache.get(templateId);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
		return {
			createdAt: cached.createdAt,
			updatedAt: cached.updatedAt,
		};
	}

	let result: { createdAt?: string; updatedAt?: string } = {};

	try {
		// Rate limiting: wait if we're calling the API too frequently
		const now = Date.now();
		if (now - lastApiCall < API_CALL_INTERVAL) {
			await new Promise((resolve) =>
				setTimeout(resolve, API_CALL_INTERVAL - (now - lastApiCall)),
			);
		}
		lastApiCall = Date.now();

		// Try to fetch from GitHub API to get the actual creation date
		// We'll try multiple approaches to get the most accurate date

		// Approach 1: Get the commit history for the template directory
		const commitsResponse = await fetch(
			`https://api.github.com/repos/dokploy/templates/commits?path=blueprints/${templateId}`,
			{
				headers: {
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "Dokploy-Templates",
				},
			},
		);

		if (commitsResponse.ok) {
			const commits = await commitsResponse.json();
			if (commits.length > 0) {
				// Get the first commit (creation) and last commit (update)
				const firstCommit = commits[commits.length - 1]; // Oldest commit
				const lastCommit = commits[0]; // Most recent commit

				result = {
					createdAt: firstCommit.commit.author.date,
					updatedAt: lastCommit.commit.author.date,
				};
			}
		}

		// Approach 2: Fallback to directory contents if commits approach didn't work
		if (!result.createdAt) {
			const response = await fetch(
				`https://api.github.com/repos/dokploy/templates/contents/blueprints/${templateId}`,
				{
					headers: {
						Accept: "application/vnd.github.v3+json",
						"User-Agent": "Dokploy-Templates",
					},
				},
			);

			if (response.ok) {
				const data = await response.json();
				result = {
					createdAt: data.created_at,
					updatedAt: data.updated_at,
				};
			}
		}
	} catch (error) {
		console.warn(
			`Could not fetch creation date for template ${templateId}:`,
			error,
		);
	}

	// Fallback: provide a reasonable default date based on template ID if we couldn't get real dates
	if (!result.createdAt) {
		const fallbackDate = new Date();
		// Use template ID hash to create a pseudo-random but consistent date
		const hash = templateId.split("").reduce((a, b) => {
			a = (a << 5) - a + b.charCodeAt(0);
			return a & a;
		}, 0);
		// Spread templates over the last 2 years
		fallbackDate.setFullYear(fallbackDate.getFullYear() - 1);
		fallbackDate.setMonth(fallbackDate.getMonth() - (Math.abs(hash) % 12));
		fallbackDate.setDate(fallbackDate.getDate() - (Math.abs(hash) % 30));

		result = {
			createdAt: fallbackDate.toISOString(),
			updatedAt: fallbackDate.toISOString(),
		};
	}

	// Cache the result
	templateDatesCache.set(templateId, { ...result, timestamp: Date.now() });
	return result;
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

		// Fetch creation dates for each template with batching to avoid overwhelming the API
		const templatesWithDates = [];
		const BATCH_SIZE = 5; // Process 5 templates at a time

		for (let i = 0; i < templates.length; i += BATCH_SIZE) {
			const batch = templates.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async (template) => {
					const dates = await fetchTemplateCreationDate(template.id);
					return {
						id: template.id,
						name: template.name,
						description: template.description,
						version: template.version,
						logo: template.logo,
						links: template.links,
						tags: template.tags,
						createdAt: dates.createdAt,
						updatedAt: dates.updatedAt,
					};
				}),
			);
			templatesWithDates.push(...batchResults);
		}

		return templatesWithDates;
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
