import type { AiProvider } from "@woap/server/db/schema";
import { streamText } from "ai";
import { createAIProvider } from "@woap/server/utils/ai/select-ai-provider";

interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
}

interface ChatResponse {
	message: string;
	actions?: Array<{
		type: string;
		description: string;
		status: "pending" | "executing" | "completed" | "failed";
	}>;
}

const SYSTEM_PROMPT = `You are WOAP AI Assistant, an intelligent helper for the WOAP platform - an AI-powered no-code backend platform.

Your role is to help users:
1. Create and manage databases (PostgreSQL, MySQL, MongoDB, MariaDB, Redis)
2. Deploy applications from Git repositories
3. Configure Docker services and Docker Compose
4. Set up domains and SSL certificates
5. Manage backups and monitoring
6. Configure environment variables
7. Scale applications with Docker Swarm

When users ask for help, you should:
- Understand their intent clearly
- Ask clarifying questions if needed
- Provide clear, step-by-step guidance
- Explain what actions will be taken
- Use friendly, conversational language

Key capabilities you can help with:
- "Create a PostgreSQL database" → Guide through database creation
- "Deploy my Node.js app" → Help with app deployment from Git
- "Set up Redis for caching" → Create Redis instance
- "Add SSL to my domain" → Configure HTTPS
- "Scale my application" → Help with Docker Swarm scaling
- "Create a backup" → Set up automated backups

Be helpful, clear, and proactive. If something requires multiple steps, break it down.
Always confirm before taking actions that modify infrastructure.

Current limitations:
- You can guide users but cannot directly execute commands yet
- Users need to configure AI provider in Settings > AI first
- Some actions require manual confirmation`;

export async function parseUserIntent(
	message: string,
	conversationHistory: ConversationMessage[],
	aiConfig: AiProvider,
	organizationId: string,
): Promise<ChatResponse> {
	try {
		// Create AI provider based on configuration
		const provider = createAIProvider(
			aiConfig.apiUrl,
			aiConfig.apiKey,
			aiConfig.model,
		);

		// Build conversation context
		const messages = [
			{ role: "system" as const, content: SYSTEM_PROMPT },
			...conversationHistory.map((msg) => ({
				role: msg.role,
				content: msg.content,
			})),
			{ role: "user" as const, content: message },
		];

		// Analyze user intent
		const intent = analyzeIntent(message.toLowerCase());

		// Generate AI response
		const { textStream } = streamText({
			model: provider,
			messages,
			temperature: 0.7,
			maxTokens: 1000,
		});

		// Collect the full response
		let fullResponse = "";
		for await (const chunk of textStream) {
			fullResponse += chunk;
		}

		// Generate actions based on intent
		const actions = generateActions(intent, message);

		return {
			message: fullResponse,
			actions,
		};
	} catch (error) {
		console.error("AI Chat Error:", error);

		// Fallback response if AI fails
		return {
			message:
				"I encountered an issue connecting to the AI service. Please check your AI provider configuration in Settings > AI, or try again in a moment.",
			actions: [],
		};
	}
}

// Analyze user intent from message
function analyzeIntent(message: string): string {
	const intents = {
		create_database: [
			"create database",
			"new database",
			"add database",
			"postgresql",
			"postgres",
			"mysql",
			"mongodb",
			"redis",
			"mariadb",
		],
		deploy_app: [
			"deploy app",
			"deploy application",
			"new app",
			"create app",
			"github",
			"gitlab",
			"git",
		],
		setup_domain: [
			"domain",
			"ssl",
			"https",
			"certificate",
			"add domain",
			"configure domain",
		],
		create_backup: ["backup", "backups", "automated backup"],
		scale_app: ["scale", "scaling", "docker swarm", "cluster"],
		help: ["help", "how to", "what can you do", "guide"],
	};

	for (const [intent, keywords] of Object.entries(intents)) {
		if (keywords.some((keyword) => message.includes(keyword))) {
			return intent;
		}
	}

	return "general";
}

// Generate actionable steps based on intent
function generateActions(
	intent: string,
	message: string,
): ChatResponse["actions"] {
	const actions: ChatResponse["actions"] = [];

	switch (intent) {
		case "create_database":
			actions.push({
				type: "navigate",
				description: "Navigate to database creation page",
				status: "pending",
			});
			break;

		case "deploy_app":
			actions.push(
				{
					type: "check_git",
					description: "Check Git provider connection",
					status: "pending",
				},
				{
					type: "navigate",
					description: "Open application deployment wizard",
					status: "pending",
				},
			);
			break;

		case "setup_domain":
			actions.push({
				type: "navigate",
				description: "Go to domain settings",
				status: "pending",
			});
			break;

		case "create_backup":
			actions.push({
				type: "navigate",
				description: "Open backup configuration",
				status: "pending",
			});
			break;

		case "scale_app":
			actions.push({
				type: "navigate",
				description: "Access scaling settings",
				status: "pending",
			});
			break;
	}

	return actions;
}
