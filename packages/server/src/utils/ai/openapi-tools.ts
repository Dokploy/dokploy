import { dynamicTool } from "ai";
import { z } from "zod";

/**
 * Converts an OpenAPI spec into AI SDK tool definitions automatically.
 *
 * Each endpoint becomes a tool that the agent can call. The tool name
 * is the operationId, the description comes from the endpoint's
 * summary/description, and the input schema is derived from the
 * request body or query parameters.
 */

interface OpenApiSpec {
	paths: Record<string, Record<string, OpenApiOperation>>;
}

interface OpenApiOperation {
	operationId: string;
	summary?: string;
	description?: string;
	tags?: string[];
	deprecated?: boolean;
	parameters?: OpenApiParameter[];
	requestBody?: {
		required?: boolean;
		content: Record<
			string,
			{
				schema: JsonSchema;
			}
		>;
	};
}

interface OpenApiParameter {
	name: string;
	in: "query" | "path" | "header";
	required?: boolean;
	schema: JsonSchema;
	description?: string;
}

interface JsonSchema {
	type?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	enum?: unknown[];
	description?: string;
	default?: unknown;
	nullable?: boolean;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	allOf?: JsonSchema[];
	format?: string;
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
}

interface ToolConfig {
	baseUrl: string;
	cookie: string;
}

interface GenerateToolsOptions {
	/** Only include tools whose tag matches one of these */
	tags?: string[];
	/** Only include these specific operationIds */
	operationIds?: string[];
	/** Exclude these operationIds */
	exclude?: string[];
	/** Max response size in chars before truncating (default: 15000) */
	maxResponseSize?: number;
}

// ─── JSON Schema → Zod conversion ──────────────────────────────

function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
	if (!schema || !schema.type) {
		// anyOf / oneOf / allOf — just accept anything
		if (schema?.anyOf || schema?.oneOf || schema?.allOf) {
			return z.any();
		}
		return z.any();
	}

	switch (schema.type) {
		case "string": {
			let s = z.string();
			if (schema.enum) {
				return z.enum(schema.enum as [string, ...string[]]);
			}
			if (schema.minLength) s = s.min(schema.minLength);
			if (schema.maxLength) s = s.max(schema.maxLength);
			if (schema.description) s = s.describe(schema.description);
			return s;
		}
		case "number":
		case "integer": {
			let n = z.number();
			if (schema.minimum !== undefined) n = n.min(schema.minimum);
			if (schema.maximum !== undefined) n = n.max(schema.maximum);
			if (schema.description) n = n.describe(schema.description);
			return n;
		}
		case "boolean":
			return z.boolean();
		case "array": {
			const itemSchema = schema.items
				? jsonSchemaToZod(schema.items)
				: z.any();
			return z.array(itemSchema);
		}
		case "object": {
			if (!schema.properties) {
				return z.object({});
			}
			const shape: Record<string, z.ZodTypeAny> = {};
			const required = new Set(schema.required ?? []);
			for (const [key, propSchema] of Object.entries(schema.properties)) {
				const zodProp = jsonSchemaToZod(propSchema);
				shape[key] = required.has(key) ? zodProp : zodProp.optional();
			}
			return z.object(shape);
		}
		default:
			return z.any();
	}
}

function buildInputSchema(
	operation: OpenApiOperation,
): z.ZodObject<z.ZodRawShape> {
	const shape: Record<string, z.ZodTypeAny> = {};

	// Query/path parameters → flat keys
	if (operation.parameters) {
		for (const param of operation.parameters) {
			if (param.in === "header") continue;
			const zodParam = jsonSchemaToZod(param.schema);
			const described = param.description
				? zodParam.describe(param.description)
				: zodParam;
			shape[param.name] = param.required ? described : described.optional();
		}
	}

	// Request body → merge properties into the same object
	if (operation.requestBody) {
		const content = operation.requestBody.content;
		const jsonContent = content["application/json"];
		if (jsonContent?.schema) {
			const bodySchema = jsonContent.schema;
			if (bodySchema.properties) {
				const required = new Set(bodySchema.required ?? []);
				for (const [key, propSchema] of Object.entries(
					bodySchema.properties,
				)) {
					const zodProp = jsonSchemaToZod(propSchema);
					shape[key] = required.has(key) ? zodProp : zodProp.optional();
				}
			}
		}
	}

	return z.object(shape);
}

// ─── API caller ─────────────────────────────────────────────────

async function callApi(
	config: ToolConfig,
	method: string,
	path: string,
	params: Record<string, unknown> | undefined,
	maxResponseSize: number,
): Promise<string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Cookie: config.cookie,
	};

	let url = `${config.baseUrl}${path}`;

	if (method === "get" && params) {
		const searchParams = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				searchParams.append(key, String(value));
			}
		}
		const qs = searchParams.toString();
		if (qs) url += `?${qs}`;
	}

	const response = await fetch(url, {
		method: method.toUpperCase(),
		headers,
		...(method !== "get" && params
			? { body: JSON.stringify(params) }
			: {}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`API error (${response.status}): ${errorText.slice(0, 500)}`,
		);
	}

	const json = JSON.stringify(await response.json(), null, 2);
	if (json.length > maxResponseSize) {
		return `${json.slice(0, maxResponseSize)}\n\n... [Truncated — ${json.length} chars total]`;
	}
	return json;
}

// ─── Main conversion ────────────────────────────────────────────

export function openApiToTools(
	spec: OpenApiSpec,
	config: ToolConfig,
	options: GenerateToolsOptions = {},
) {
	const {
		tags,
		operationIds,
		exclude,
		maxResponseSize = 15000,
	} = options;

	const tagSet = tags ? new Set(tags) : null;
	const idSet = operationIds ? new Set(operationIds) : null;
	const excludeSet = exclude ? new Set(exclude) : null;
	const tools: Record<string, ReturnType<typeof dynamicTool>> = {};

	for (const [path, methods] of Object.entries(spec.paths)) {
		for (const [method, operation] of Object.entries(methods)) {
			const opId = operation.operationId;
			if (!opId) continue;
			if (operation.deprecated) continue;

			// Filtering
			if (excludeSet?.has(opId)) continue;
			if (idSet && !idSet.has(opId)) continue;
			if (tagSet && !operation.tags?.some((t) => tagSet.has(t))) continue;

			const description = [operation.summary, operation.description]
				.filter(Boolean)
				.join(". ");

			const inputSchema = buildInputSchema(operation);

			const isWriteAction = method !== "get";

			tools[opId] = dynamicTool({
				description: description || `Call ${method.toUpperCase()} ${path}`,
				inputSchema,
				needsApproval: isWriteAction,
				execute: async (rawInput: unknown) => {
					const input = (rawInput ?? {}) as Record<string, unknown>;
					const params =
						Object.keys(input).length > 0 ? input : undefined;
					return callApi(config, method, path, params, maxResponseSize);
				},
			});
		}
	}

	return tools;
}

/**
 * Returns a summary of all available tools (name + description).
 * Useful for debugging or for the system prompt.
 */
export function getToolsSummary(
	spec: OpenApiSpec,
	options: GenerateToolsOptions = {},
): { name: string; description: string; tag: string; method: string }[] {
	const { tags, operationIds, exclude } = options;

	const tagSet = tags ? new Set(tags) : null;
	const idSet = operationIds ? new Set(operationIds) : null;
	const excludeSet = exclude ? new Set(exclude) : null;
	const summary: {
		name: string;
		description: string;
		tag: string;
		method: string;
	}[] = [];

	for (const [_path, methods] of Object.entries(spec.paths)) {
		for (const [method, operation] of Object.entries(methods)) {
			const opId = operation.operationId;
			if (!opId) continue;
			if (operation.deprecated) continue;
			if (excludeSet?.has(opId)) continue;
			if (idSet && !idSet.has(opId)) continue;
			if (tagSet && !operation.tags?.some((t) => tagSet.has(t))) continue;

			summary.push({
				name: opId,
				description:
					[operation.summary, operation.description]
						.filter(Boolean)
						.join(". ") || "",
				tag: operation.tags?.[0] ?? "default",
				method: method.toUpperCase(),
			});
		}
	}

	return summary;
}
