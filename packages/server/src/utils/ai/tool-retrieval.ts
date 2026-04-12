import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface EndpointEmbedding {
	operationId: string;
	text: string;
	tags: string[];
	embedding: number[];
}

const VOYAGE_MODEL = "voyage-3-lite";
const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 128;

/**
 * Call Voyage AI to embed an array of texts.
 */
async function embedTexts(
	texts: string[],
	apiKey: string,
	inputType: "document" | "query" = "document",
): Promise<number[][]> {
	const results: number[][] = [];

	for (let i = 0; i < texts.length; i += BATCH_SIZE) {
		const batch = texts.slice(i, i + BATCH_SIZE);
		const response = await fetch(VOYAGE_API, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: VOYAGE_MODEL,
				input: batch,
				input_type: inputType,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Voyage API error: ${response.status} ${await response.text()}`,
			);
		}

		const data = (await response.json()) as {
			data: { embedding: number[] }[];
		};
		for (const item of data.data) {
			results.push(item.embedding);
		}
	}

	return results;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// In-memory cache
let cachedEmbeddings: EndpointEmbedding[] | null = null;

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

/**
 * Build a rich text representation for an endpoint (used for embedding).
 * Includes: operationId, method, path, params with enums, summary, description.
 */
function buildEndpointText(
	op: any,
	method: string,
	path: string,
): string {
	const parts: string[] = [];

	// Operation identity
	parts.push(`${op.operationId} [${method.toUpperCase()} ${path}]`);

	// Tags
	if (op.tags?.length) {
		parts.push(`Tags: ${op.tags.join(", ")}`);
	}

	// Summary + description
	if (op.summary) parts.push(op.summary);
	if (op.description) parts.push(op.description);

	// Parameters
	const params: string[] = [];
	if (op.parameters) {
		for (const p of op.parameters) {
			if (p.in === "header") continue;
			const req = p.required ? "required" : "optional";
			params.push(`${p.name} (${req})`);
		}
	}

	if (op.requestBody?.content?.["application/json"]?.schema) {
		const schema = op.requestBody.content["application/json"].schema;
		const requiredSet = new Set(schema.required ?? []);
		if (schema.properties) {
			for (const [key, prop] of Object.entries(
				schema.properties as Record<string, any>,
			)) {
				const req = requiredSet.has(key) ? "required" : "optional";
				const enumVals = extractEnum(prop);
				const enumStr = enumVals ? ` [${enumVals.join("|")}]` : "";
				params.push(`${key} (${req})${enumStr}`);
			}
		}
	}

	if (params.length > 0) {
		parts.push(`Parameters: ${params.join(", ")}`);
	}

	return parts.join(". ");
}

/**
 * Generate or load embeddings for all endpoints in the OpenAPI spec.
 * Embeddings are cached in .tool-embeddings.json and in memory.
 */
export async function getOrCreateEmbeddings(
	spec: any,
	voyageApiKey: string,
	cachePath?: string,
): Promise<EndpointEmbedding[]> {
	// Return from memory cache
	if (cachedEmbeddings) return cachedEmbeddings;

	// Try loading from file cache
	const filePath =
		cachePath || join(process.cwd(), ".tool-embeddings.json");

	if (existsSync(filePath)) {
		try {
			const data = JSON.parse(readFileSync(filePath, "utf-8"));
			if (Array.isArray(data) && data.length > 0 && data[0].embedding) {
				cachedEmbeddings = data;
				return cachedEmbeddings;
			}
		} catch {
			// Corrupted file — regenerate
		}
	}

	// Generate embeddings from spec
	const endpoints: { operationId: string; text: string; tags: string[] }[] =
		[];

	for (const [path, methods] of Object.entries(spec.paths ?? {})) {
		for (const [method, op] of Object.entries(methods as Record<string, any>)) {
			if (!op.operationId || op.deprecated) continue;
			endpoints.push({
				operationId: op.operationId,
				text: buildEndpointText(op, method, path),
				tags: op.tags ?? [],
			});
		}
	}

	if (endpoints.length === 0) {
		cachedEmbeddings = [];
		return cachedEmbeddings;
	}

	const texts = endpoints.map((e) => e.text);
	const embeddings = await embedTexts(texts, voyageApiKey, "document");

	cachedEmbeddings = endpoints.map((e, i) => ({
		...e,
		embedding: embeddings[i]!,
	}));

	// Persist to file
	try {
		writeFileSync(filePath, JSON.stringify(cachedEmbeddings));
	} catch {
		// Non-critical — will regenerate next time
	}

	return cachedEmbeddings;
}

/**
 * Retrieve the top-K most relevant endpoints for a user query,
 * optionally filtered to a pre-computed set of allowed operationIds.
 */
export async function retrieveRelevantEndpoints(
	query: string,
	allEmbeddings: EndpointEmbedding[],
	voyageApiKey: string,
	options?: {
		allowedOperationIds?: Set<string>;
		topK?: number;
	},
): Promise<string[]> {
	const { allowedOperationIds, topK = 20 } = options ?? {};

	// Filter to allowed operationIds (from tag filtering)
	const candidates = allowedOperationIds
		? allEmbeddings.filter((e) => allowedOperationIds.has(e.operationId))
		: allEmbeddings;

	if (candidates.length === 0) return [];

	// Embed the user query
	const [queryEmbedding] = await embedTexts([query], voyageApiKey, "query");
	if (!queryEmbedding) return [];

	// Score and rank
	const scored = candidates.map((e) => ({
		operationId: e.operationId,
		score: cosineSimilarity(queryEmbedding, e.embedding),
	}));

	scored.sort((a, b) => b.score - a.score);

	return scored.slice(0, topK).map((s) => s.operationId);
}
