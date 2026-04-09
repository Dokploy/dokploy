import { validateRequest } from "@dokploy/server";
import { getAiSettingById } from "@dokploy/server/services/ai";
import {
	type ChatContext,
	getAllTools,
	getReadTools,
} from "@dokploy/server/utils/ai/chat-tools";
import { selectAIProvider } from "@dokploy/server/utils/ai/select-ai-provider";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { NextApiRequest, NextApiResponse } from "next";

function buildSystemPrompt(context: ChatContext) {
	return `You are an autonomous DevOps agent inside Dokploy, a self-hosted PaaS that uses Docker.

YOU ARE AN AGENT — act autonomously:
- NEVER ask the user for IDs, parameters, or information you can find yourself with tools
- NEVER respond without calling tools first — always investigate before answering
- Chain multiple tool calls: get info → analyze → act → verify
- If one tool gives you data you need for another tool, call the next tool immediately

${context.type !== "general" ? `CURRENT CONTEXT: You are on a ${context.type} page. The ${context.type}Id is "${context.id}" — all tools already use this ID automatically. You do NOT need to pass it.` : ""}

Dokploy data model:
- Project → Environment(s) → Services (applications, compose, postgres, mysql, redis, mongo, mariadb, libsql)
- Each application/compose has deployments with status (done/error/running/cancelled)
- To investigate a failed build: call list-deployments → find the one with status "error" → call read-deployment-logs with that deploymentId → analyze the error

Guidelines:
- Be concise — summarize findings, don't dump raw JSON
- Before destructive actions (stop, delete), explain what you'll do first
- When updating env vars, ALWAYS get current ones first (from get-application-info) and include ALL existing vars plus the new ones
- If a tool errors, try a different approach`;
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
		const context = (body.context as ChatContext) || { type: "general" as const, id: "" };

		if (!aiId || !messages) {
			return res.status(400).json({ error: "Missing aiId or messages" });
		}

		const aiSettings = await getAiSettingById(aiId);
		if (!aiSettings || !aiSettings.isEnabled) {
			return res.status(400).json({ error: "AI provider not enabled" });
		}

		const provider = selectAIProvider(aiSettings);
		const model = provider(aiSettings.model);

		const protocol = req.headers["x-forwarded-proto"] || "http";
		const host = req.headers.host || "localhost:3000";
		const toolConfig = {
			baseUrl: `${protocol}://${host}/api`,
			cookie: req.headers.cookie || "",
		};

		// All tools (read + write) — prepareStep controls which are active
		const allTools = getAllTools(context, toolConfig);
		const readToolNames = Object.keys(getReadTools(context, toolConfig));

		const modelMessages = await convertToModelMessages(messages);

		const result = streamText({
			model,
			system: buildSystemPrompt(context),
			messages: modelMessages,
			tools: allTools,
			prepareStep: ({ steps }) => {
				// First 3 steps: only read tools (investigate first)
				// After that: all tools (can take action)
				if (steps.length < 3) {
					return {
						activeTools: readToolNames as (keyof typeof allTools)[],
					};
				}
				return {};
			},
			stopWhen: stepCountIs(10),
		});

		result.pipeUIMessageStreamToResponse(res);
	} catch (error) {
		console.error("AI chat error:", error);
		return res.status(500).json({
			error: error instanceof Error ? error.message : "Internal server error",
		});
	}
}
