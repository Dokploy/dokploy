import { z } from "zod";

export const n8nConfigSchema = z.object({
	url: z.string().url("Must be a valid URL"),
	secret: z.string().optional(),
	workflowId: z.string().optional(),
	testMode: z.boolean().optional().default(false),
	includeMetrics: z.boolean().optional().default(true),
	includeLogs: z.boolean().optional().default(true),
	logLines: z.number().min(1).max(1000).optional().default(50),
	minimumSeverity: z
		.enum(["all", "warning", "error"])
		.optional()
		.default("all"),
	branches: z.array(z.string()).optional(),
	customFields: z.record(z.any()).optional(),
	transformScript: z.string().optional(),
});

export const slackConfigSchema = z.object({
	url: z.string().url("Must be a valid Slack webhook URL"),
	channel: z.string().optional(),
	mentionOn: z
		.object({
			failure: z.boolean().default(true),
			success: z.boolean().default(false),
			users: z.array(z.string()).optional(),
			groups: z.array(z.string()).optional(),
		})
		.optional(),
	threadingEnabled: z.boolean().optional().default(false),
	threadingStrategy: z
		.enum(["per-app", "per-deployment", "per-day"])
		.optional()
		.default("per-app"),
	colorScheme: z
		.enum(["default", "custom", "monochrome"])
		.optional()
		.default("default"),
	includeGraphs: z.boolean().optional().default(false),
	logoUrl: z.string().url().optional(),
	includeChangelog: z.boolean().optional().default(false),
	includeMetrics: z.boolean().optional().default(true),
	includeCommitHistory: z.boolean().optional().default(true),
	maxCommits: z.number().min(1).max(20).optional().default(5),
	enableActions: z.boolean().optional().default(true),
	customActions: z
		.array(
			z.object({
				text: z.string().max(30),
				url: z.string().url(),
				style: z
					.enum(["primary", "danger", "default"])
					.optional()
					.default("default"),
			}),
		)
		.optional(),
});

export const webhookTemplateSchema = z.discriminatedUnion("templateType", [
	z.object({
		templateType: z.literal("generic"),
		customTemplate: z.string().optional(),
	}),
	z.object({
		templateType: z.literal("slack"),
		platformConfig: slackConfigSchema.optional(),
	}),
	z.object({
		templateType: z.literal("n8n"),
		platformConfig: n8nConfigSchema.optional(),
	}),
]);

export const createTemplateContextSchema = z.object({
	event: z.enum([
		"deployment.started",
		"deployment.success",
		"deployment.failed",
		"deployment.cancelled",
	]),
	timestamp: z.string(),
	webhookId: z.string(),
	deployment: z.object({
		deploymentId: z.string(),
		status: z.string(),
		startedAt: z.string(),
		finishedAt: z.string().optional(),
		duration: z.number().optional(),
		stage: z.string().optional(),
	}),
	entity: z.object({
		type: z.enum(["application", "compose"]),
		id: z.string(),
		name: z.string(),
		url: z.string().optional(),
		domains: z.array(z.string()).optional(),
	}),
	project: z.object({
		id: z.string(),
		name: z.string(),
	}),
	source: z
		.object({
			type: z.enum(["github", "gitlab", "bitbucket", "docker", "git"]),
			branch: z.string().optional(),
			commit: z.string().optional(),
			repository: z.string().optional(),
			commitMessage: z.string().optional(),
			author: z.string().optional(),
		})
		.optional(),
	trigger: z.object({
		type: z.enum(["webhook", "manual", "schedule", "api"]),
		triggeredBy: z.string(),
		source: z.string().optional(),
	}),
	error: z
		.object({
			message: z.string(),
			stage: z.string().optional(),
			code: z.string().optional(),
			logs: z.string().optional(),
		})
		.optional(),
});

export type N8nConfig = z.infer<typeof n8nConfigSchema>;
export type SlackConfig = z.infer<typeof slackConfigSchema>;
export type WebhookTemplate = z.infer<typeof webhookTemplateSchema>;
export type TemplateContext = z.infer<typeof createTemplateContextSchema>;
