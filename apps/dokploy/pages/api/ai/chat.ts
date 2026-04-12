import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { getAiSettingById } from "@dokploy/server/services/ai";
import {
	type ChatContext,
	getAllTools,
} from "@dokploy/server/utils/ai/chat-tools";
import {
	buildEndpointCatalog,
	createApiTool,
} from "@dokploy/server/utils/ai/api-tool";
import {
	getOrCreateEmbeddings,
	retrieveRelevantEndpoints,
} from "@dokploy/server/utils/ai/tool-retrieval";
import { selectAIProvider } from "@dokploy/server/utils/ai/select-ai-provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { NextApiRequest, NextApiResponse } from "next";

let cachedSpec: any = null;

function getOpenApiSpec() {
	if (!cachedSpec) {
		try {
			const specPath = join(process.cwd(), "../../openapi.json");
			cachedSpec = JSON.parse(readFileSync(specPath, "utf-8"));
		} catch {
			cachedSpec = null;
		}
	}
	return cachedSpec;
}

function buildContextBlock(context: ChatContext): string {
	if (context.type === "general") {
		return "CONTEXT: The user is on the general dashboard (no specific resource selected). Use project-all to list their projects if needed.";
	}

	const lines: string[] = [];
	lines.push(
		`CONTEXT: The user is currently viewing a specific ${context.type}. The ${context.type}Id is "${context.id}".`,
	);
	lines.push(
		`When the user says "this app", "this service", "this database", "add env var", etc., they ALWAYS mean this ${context.type} (ID: "${context.id}"). NEVER ask which service they mean.`,
	);

	if (context.projectId) {
		lines.push(`- projectId: "${context.projectId}"`);
	}
	if (context.environmentId) {
		lines.push(`- environmentId: "${context.environmentId}"`);
	}
	if (context.serverId) {
		lines.push(`- serverId: "${context.serverId}"`);
	}

	lines.push(
		"Use these IDs directly when calling tools — do NOT ask the user for them. You already know exactly which resource the user is talking about.",
	);

	return lines.join("\n");
}

function buildSystemPrompt(context: ChatContext, catalog: string | null, endpointCount?: number) {
	const contextBlock = buildContextBlock(context);

	return `You are an autonomous DevOps agent inside Dokploy (Docker-based PaaS). You take action immediately — you don't explain, you don't ask, you DO.

${contextBlock}

THINKING PROCESS (do this before EVERY action):
1. Scan ALL section headers (## tag — description) in the ENDPOINT CATALOG to find which sections are relevant
2. Read the endpoint descriptions in those sections to pick the right operationId
3. Call the endpoint with the correct params — use the IDs from the context above

BEHAVIOR:
- When the user asks you to do something → DO IT. Call the API right away.
- When you need information → call the endpoint to get it. Never say "I can't access" or "I don't have the ability to".
- When something fails → read the error, figure out the fix, and apply it. Don't stop to explain the error — fix it.
- EVERY capability you need is in the ENDPOINT CATALOG below. If you think you can't do something, you're wrong — scan ALL sections again.
- You already have all the IDs you need from the context above. NEVER ask the user for IDs, paths, or information you can discover by calling endpoints.
- NEVER ask for confirmation or permission. The only exception is deleting a service entirely. For everything else (read, update, deploy, stop, start, restart) → just do it immediately.

KEY PATTERN: When you need to explore files, find paths, or check repository structure → use the "patch" section endpoints to browse directories and read files. NEVER ask the user for file paths.

DATA MODEL: Project → Environment → Services (application, compose, postgres, mysql, redis, mongo, mariadb, libsql). Each service has deployments with build logs.

TOOL: You have one tool "call_api". Pass operationId + params from the catalog.
- ALWAYS pass required params (*) in the "params" object. Example: { "operationId": "domain-byComposeId", "params": { "composeId": "abc123" } }
- Params: * = required, ? = optional, [a|b|c] = allowed values
- GET = read-only (auto-executed). POST/PUT/DELETE = write (user approves).
- If a call fails, read the error message and fix the params. NEVER retry the same call with the same params.

RESPONSE STYLE:
- 2-3 sentences max. No walls of text.
- Never explain limitations — find the right endpoint and act.
- Answer in the user's language.

${catalog ? `ENDPOINT CATALOG (${endpointCount} endpoints):\n${catalog}` : ""}`;
}

function getUserMessages(messages: any[]): string {
	const texts: string[] = [];
	for (const msg of messages) {
		if (msg.role !== "user") continue;
		if (typeof msg.content === "string") {
			texts.push(msg.content);
		} else if (Array.isArray(msg.content)) {
			texts.push(
				msg.content
					.filter((p: any) => p.type === "text")
					.map((p: any) => p.text)
					.join(" "),
			);
		}
	}
	return texts.slice(-3).join(". ");
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		const { session, user } = await validateRequest(req);
		if (!user || !session) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const body = req.body;
		const messages = body.messages;
		const aiId = body.aiId;
		const context = (body.context as ChatContext) || {
			type: "general" as const,
			id: "",
		};

		// ─── Resolve model ────────────────────────────────────────
		let model: any;

		if (IS_CLOUD && process.env.CLOUD_ANTHROPIC_API_KEY) {
			const anthropic = createAnthropic({
				apiKey: process.env.CLOUD_ANTHROPIC_API_KEY,
			});
			model = anthropic("claude-haiku-4-5-20251001");
		} else {
			if (!aiId || !messages) {
				return res
					.status(400)
					.json({ error: "Missing aiId or messages" });
			}
			const aiSettings = await getAiSettingById(aiId);
			if (!aiSettings || !aiSettings.isEnabled) {
				return res
					.status(400)
					.json({ error: "AI provider not enabled" });
			}
			const provider = selectAIProvider(aiSettings);
			model = provider(aiSettings.model);
		}

		if (!messages) {
			return res.status(400).json({ error: "Missing messages" });
		}

		// ─── Resolve tools ────────────────────────────────────────
		const protocol = req.headers["x-forwarded-proto"] || "http";
		const host = req.headers.host || "localhost:3000";
		const toolConfig = {
			baseUrl: `${protocol}://${host}/api`,
			cookie: req.headers.cookie || "",
		};

		let tools: Record<string, any>;
		let catalogText: string | null = null;
		let endpointCount = 0;
		const spec = getOpenApiSpec();

		if (spec) {
			const voyageApiKey = process.env.VOYAGE_API_KEY;
			if (!voyageApiKey) {
				return res.status(400).json({ error: "VOYAGE_API_KEY is required" });
			}

			const embeddingsPath = join(process.cwd(), ".tool-embeddings.json");
			const allEmbeddings = await getOrCreateEmbeddings(
				spec,
				voyageApiKey,
				embeddingsPath,
			);

			const userQuery = getUserMessages(messages).trim();
			const { operationIds: tagFilteredIds } = buildEndpointCatalog(spec, context.type);

			let relevantIds: Set<string> | undefined;

			if (userQuery && allEmbeddings.length > 0) {
				const topIds = await retrieveRelevantEndpoints(
					userQuery,
					allEmbeddings,
					voyageApiKey,
					{ allowedOperationIds: tagFilteredIds, topK: 25 },
				);

				if (topIds.length > 0) {
					relevantIds = new Set(topIds);
				}
			}

			const { catalog, count, operationIds } = buildEndpointCatalog(
				spec,
				context.type,
				relevantIds,
			);
			catalogText = catalog;
			endpointCount = count;
			tools = createApiTool(spec, toolConfig, operationIds, 8000);
		} else {
			tools = getAllTools(context, toolConfig);
		}

		// ─── Stream response ──────────────────────────────────────
		const modelMessages = await convertToModelMessages(messages);

		const result = streamText({
			model,
			system: buildSystemPrompt(context, catalogText, endpointCount),
			messages: modelMessages,
			tools,
			stopWhen: stepCountIs(12),
		});

		// Disable buffering for streaming
		res.setHeader("X-Accel-Buffering", "no");
		res.setHeader("Cache-Control", "no-cache, no-transform");

		result.pipeUIMessageStreamToResponse(res);
	} catch (error) {
		console.error("AI chat error:", error);
		return res.status(500).json({
			error:
				error instanceof Error ? error.message : "Internal server error",
		});
	}
}
