import { parse } from "toml";
import {
	assertCloudHostResolvesPublic,
	fetchWithPublicEgress,
	type HostnameLookup,
} from "../utils/url/network";

const DEFAULT_TEMPLATES_BASE_URL = "https://templates.dokploy.com";

type TemplateFetchOptions = {
	lookup?: HostnameLookup;
};

const resolveTemplatesBaseUrl = async (
	baseUrl?: string,
	options: TemplateFetchOptions = {},
) => {
	if (!baseUrl) {
		return DEFAULT_TEMPLATES_BASE_URL;
	}

	let parsed: URL;
	try {
		parsed = new URL(baseUrl);
	} catch {
		throw new Error("Invalid template base URL");
	}

	if (
		parsed.protocol !== "https:" ||
		parsed.username ||
		parsed.password ||
		(parsed.pathname !== "" && parsed.pathname !== "/") ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error("Invalid template base URL");
	}

	await assertCloudHostResolvesPublic(parsed.hostname, {
		fieldName: "template base URL",
		lookup: options.lookup,
	});

	return parsed.origin;
};

const buildTemplateUrl = (templateBaseUrl: string, pathname: string) => {
	return new URL(pathname, templateBaseUrl).toString();
};

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
		isolated?: boolean;
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
	baseUrl?: string,
	options: TemplateFetchOptions = {},
): Promise<TemplateMetadata[]> {
	const templateBaseUrl = await resolveTemplatesBaseUrl(baseUrl, options);
	const response = await fetchWithPublicEgress(
		buildTemplateUrl(templateBaseUrl, "/meta.json"),
		{
			redirect: "error",
			signal: AbortSignal.timeout(10000),
		},
		{
			allowPrivateNetwork: false,
			fieldName: "template base URL",
			lookup: options.lookup,
		},
	);
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
}

/**
 * Fetches a specific template's files
 */
export async function fetchTemplateFiles(
	templateId: string,
	baseUrl?: string,
	options: TemplateFetchOptions = {},
): Promise<{ config: CompleteTemplate; dockerCompose: string }> {
	const templateBaseUrl = await resolveTemplatesBaseUrl(baseUrl, options);
	const timeout = AbortSignal.timeout(10000);
	const [templateYmlResponse, dockerComposeResponse] = await Promise.all([
		fetchWithPublicEgress(
			buildTemplateUrl(
				templateBaseUrl,
				`/blueprints/${templateId}/template.toml`,
			),
			{
				redirect: "error",
				signal: timeout,
			},
			{
				allowPrivateNetwork: false,
				fieldName: "template base URL",
				lookup: options.lookup,
			},
		),
		fetchWithPublicEgress(
			buildTemplateUrl(
				templateBaseUrl,
				`/blueprints/${templateId}/docker-compose.yml`,
			),
			{
				redirect: "error",
				signal: timeout,
			},
			{
				allowPrivateNetwork: false,
				fieldName: "template base URL",
				lookup: options.lookup,
			},
		),
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
}
