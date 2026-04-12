import { dynamicTool } from "ai";
import { z } from "zod";
import type { ChatContext } from "./chat-tools";

interface OpenApiSpec {
	paths: Record<
		string,
		Record<
			string,
			{
				operationId?: string;
				summary?: string;
				description?: string;
				tags?: string[];
				deprecated?: boolean;
				parameters?: {
					name: string;
					in: string;
					required?: boolean;
					schema?: { type?: string };
				}[];
				requestBody?: {
					content: Record<
						string,
						{ schema: { properties?: Record<string, any>; required?: string[] } }
					>;
				};
			}
		>
	>;
}

interface ToolConfig {
	baseUrl: string;
	cookie: string;
}

interface EndpointInfo {
	method: string;
	path: string;
	operationId: string;
}

/**
 * Build a compact one-line-per-endpoint catalog for the system prompt.
 * Example line: "application-deploy (POST, applicationId*, title?, description?) — Deploy an application"
 */
const EXCLUDED_TAGS = new Set([
	"notification",
	"sso",
	"stripe",
	"auditLog",
	"ai",
	"customRole",
	"whitelabeling",
]);

/** Minimal shared tags — only project/environment for navigation */
const SHARED_TAGS = ["project", "environment"];

/** Tags allowed per context type (on top of SHARED_TAGS) */
const CONTEXT_TAGS: Record<ChatContext["type"], string[]> = {
	application: [
		"application",
		"deployment",
		"domain",
		"docker",
		"mounts",
		"port",
		"security",
		"redirects",
		"registry",
		"sshKey",
		"backup",
		"volumeBackups",
		"rollback",
		"schedule",
		"patch",
		"previewDeployment",
		"bitbucket",
		"gitea",
		"github",
		"gitlab",
		"gitProvider",
		"destination",
		"tag",
	],
	compose: [
		"compose",
		"deployment",
		"domain",
		"docker",
		"backup",
		"patch",
		"sshKey",
		"bitbucket",
		"gitea",
		"github",
		"gitlab",
		"gitProvider",
		"tag",
	],
	postgres: ["postgres", "backup", "docker", "destination"],
	mysql: ["mysql", "backup", "docker", "destination"],
	redis: ["redis", "docker"],
	mongo: ["mongo", "backup", "docker", "destination"],
	mariadb: ["mariadb", "backup", "docker", "destination"],
	libsql: ["libsql", "docker"],
	project: [
		"application",
		"compose",
		"postgres",
		"mysql",
		"redis",
		"mongo",
		"mariadb",
		"libsql",
		"domain",
		"deployment",
		"docker",
		"tag",
	],
	server: [
		"server",
		"docker",
		"cluster",
		"swarm",
		"certificates",
		"registry",
		"settings",
	],
	general: [], // empty = allow all non-excluded tags
};

/**
 * Get the set of allowed tags for a given context type.
 * Returns null for "general" context (no filtering, allow all).
 */
function getAllowedTags(contextType: ChatContext["type"]): Set<string> | null {
	if (contextType === "general") return null;
	const contextSpecific = CONTEXT_TAGS[contextType];
	return new Set([...SHARED_TAGS, ...contextSpecific]);
}

/**
 * Extract enum values from a JSON Schema property (handles anyOf wrappers).
 */
function extractEnum(prop: any): string[] | null {
	if (prop?.enum) return prop.enum;
	if (Array.isArray(prop?.anyOf)) {
		for (const variant of prop.anyOf) {
			if (variant?.enum) return variant.enum;
		}
	}
	return null;
}

/** Human-readable description for each tag group in the catalog */
const TAG_DESCRIPTIONS: Record<string, string> = {
	application: "Manage application services — create, update, deploy, start, stop, and configure applications",
	compose: "Manage Docker Compose/Stack services — create, update, deploy, and configure compose files",
	postgres: "Manage PostgreSQL database services",
	mysql: "Manage MySQL database services",
	redis: "Manage Redis database services",
	mongo: "Manage MongoDB database services",
	mariadb: "Manage MariaDB database services",
	libsql: "Manage LibSQL database services",
	deployment: "View deployment history, build logs, and manage deployment lifecycle",
	domain: "Manage domains, SSL certificates, and routing for services",
	docker: "Interact with Docker containers — inspect, restart, remove, and view logs",
	backup: "Create and manage database backups, run manual backups, and restore from backups",
	patch: "Browse and modify source code files in a service's cloned repository — read directories, read files, and create file patches",
	mounts: "Manage persistent volume mounts for services",
	port: "Manage exposed port mappings for services",
	security: "Manage HTTP basic auth security rules for services",
	redirects: "Manage HTTP redirect rules for domains",
	registry: "Manage Docker registries for pulling private images",
	sshKey: "Manage SSH keys for Git repository access",
	rollback: "Rollback a service to a previous deployment",
	schedule: "Create and manage scheduled tasks (cron jobs) for services",
	previewDeployment: "Manage preview deployments for pull requests",
	volumeBackups: "Create and manage volume-level backups and restores",
	project: "Manage projects — create, update, delete, and list projects",
	environment: "Manage environments within projects — create, duplicate, and configure",
	server: "Manage servers — configure, monitor, and connect remote servers",
	settings: "View and update global Dokploy settings",
	destination: "Manage S3/storage destinations for backups",
	tag: "Manage tags for organizing and labeling services",
	cluster: "Manage Docker Swarm cluster nodes",
	swarm: "Manage Docker Swarm settings and configuration",
	certificates: "Manage SSL/TLS certificates",
	gitProvider: "Manage Git provider integrations",
	github: "Manage GitHub provider connections and repositories",
	gitlab: "Manage GitLab provider connections and repositories",
	bitbucket: "Manage Bitbucket provider connections and repositories",
	gitea: "Manage Gitea provider connections and repositories",
	user: "Manage user accounts and permissions",
};

export interface CatalogResult {
	catalog: string;
	count: number;
	operationIds: Set<string>;
}

export function buildEndpointCatalog(
	spec: OpenApiSpec,
	contextType: ChatContext["type"] = "general",
): CatalogResult {
	const operationIds = new Set<string>();
	const allowedTags = getAllowedTags(contextType);
	const groups = new Map<string, string[]>();

	for (const methods of Object.values(spec.paths)) {
		for (const op of Object.values(methods)) {
			if (!op.operationId || op.deprecated) continue;
			if (op.tags?.some((t) => EXCLUDED_TAGS.has(t))) continue;
			if (allowedTags && !op.tags?.some((t) => allowedTags.has(t))) continue;

			operationIds.add(op.operationId);

			const requiredParams: string[] = [];
			const optionalParams: string[] = [];

			if (op.parameters) {
				for (const p of op.parameters) {
					if (p.in === "header") continue;
					if (p.required) {
						requiredParams.push(`${p.name}*`);
					} else {
						optionalParams.push(`${p.name}?`);
					}
				}
			}

			if (op.requestBody?.content?.["application/json"]?.schema) {
				const schema = op.requestBody.content["application/json"].schema;
				const requiredSet = new Set(schema.required ?? []);
				if (schema.properties) {
					for (const [key, prop] of Object.entries(
						schema.properties as Record<string, any>,
					)) {
						const enumVals = extractEnum(prop);
						const suffix = enumVals
							? `[${enumVals.join("|")}]`
							: "";
						if (requiredSet.has(key)) {
							requiredParams.push(`${key}*${suffix}`);
						} else {
							optionalParams.push(`${key}?${suffix}`);
						}
					}
				}
			}

			const allParams = [...requiredParams, ...optionalParams];
			const paramStr =
				allParams.length > 0 ? `(${allParams.join(", ")})` : "";
			const summary = op.summary ? ` — ${op.summary}` : "";
			const desc = op.description ? `\n  ${op.description}` : "";
			const line = `${op.operationId}${paramStr}${summary}${desc}`;

			const tag = op.tags?.[0] ?? "other";
			if (!groups.has(tag)) groups.set(tag, []);
			groups.get(tag)!.push(line);
		}
	}

	// Order sections: context-specific tags first (in CONTEXT_TAGS order), then shared, then rest
	const contextOrder = CONTEXT_TAGS[contextType];
	const sharedOrder = SHARED_TAGS;
	const orderedTags: string[] = [];
	const seen = new Set<string>();

	for (const t of contextOrder) {
		if (groups.has(t) && !seen.has(t)) { orderedTags.push(t); seen.add(t); }
	}
	for (const t of sharedOrder) {
		if (groups.has(t) && !seen.has(t)) { orderedTags.push(t); seen.add(t); }
	}
	for (const t of groups.keys()) {
		if (!seen.has(t)) { orderedTags.push(t); seen.add(t); }
	}

	const sections: string[] = [];
	for (const tag of orderedTags) {
		const lines = groups.get(tag)!;
		const tagDesc = TAG_DESCRIPTIONS[tag];
		const header = tagDesc ? `## ${tag} — ${tagDesc}` : `## ${tag}`;
		sections.push(`${header}\n${lines.join("\n")}`);
	}

	return {
		catalog: sections.join("\n\n"),
		count: operationIds.size,
		operationIds,
	};
}

/**
 * Build a lookup map from operationId to endpoint info for execution.
 */
function buildEndpointMap(
	spec: OpenApiSpec,
): Map<string, EndpointInfo> {
	const map = new Map<string, EndpointInfo>();
	for (const [path, methods] of Object.entries(spec.paths)) {
		for (const [method, op] of Object.entries(methods)) {
			if (!op.operationId) continue;
			map.set(op.operationId, { method, path, operationId: op.operationId });
		}
	}
	return map;
}

/**
 * Creates a single "call_api" tool that only allows endpoints present in allowedOperationIds.
 */
export function createApiTool(
	spec: OpenApiSpec,
	config: ToolConfig,
	allowedOperationIds?: Set<string>,
	maxResponseSize = 4000,
) {
	const endpointMap = buildEndpointMap(spec);

	return {
		call_api: dynamicTool({
			description:
				"Call a Dokploy API endpoint. Use the operationId from the endpoint catalog and pass the required parameters.",
			inputSchema: z.object({
				operationId: z
					.string()
					.describe("The operationId from the endpoint catalog"),
				params: z
					.record(z.string(), z.any())
					.optional()
					.describe("Parameters for the endpoint (* = required)"),
			}),
			execute: async (rawInput: unknown) => {
				const { operationId, params } = rawInput as {
					operationId: string;
					params?: Record<string, unknown>;
				};

				if (allowedOperationIds && !allowedOperationIds.has(operationId)) {
					return `Error: "${operationId}" is not available in the current context. Only use operationIds from the ENDPOINT CATALOG.`;
				}

				const endpoint = endpointMap.get(operationId);
				if (!endpoint) {
					return `Error: Unknown endpoint "${operationId}". Check the endpoint catalog for valid operationIds.`;
				}

				const headers: Record<string, string> = {
					"Content-Type": "application/json",
					Cookie: config.cookie,
				};

				let url = `${config.baseUrl}${endpoint.path}`;

				if (endpoint.method === "get" && params) {
					const searchParams = new URLSearchParams();
					for (const [key, value] of Object.entries(params)) {
						if (value !== undefined && value !== null) {
							searchParams.append(key, String(value));
						}
					}
					const qs = searchParams.toString();
					if (qs) url += `?${qs}`;
				}

				try {
					const response = await fetch(url, {
						method: endpoint.method.toUpperCase(),
						headers,
						...(endpoint.method !== "get" && params
							? { body: JSON.stringify(params) }
							: {}),
					});

					if (!response.ok) {
						const errorText = await response.text();
						return `API error (${response.status}): ${errorText.slice(0, 500)}`;
					}

					const json = JSON.stringify(await response.json(), null, 2);
					if (json.length > maxResponseSize) {
						return `${json.slice(0, maxResponseSize)}\n\n... [Truncated — ${json.length} chars total]`;
					}
					return json;
				} catch (error) {
					return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
				}
			},
		}),
	};
}
