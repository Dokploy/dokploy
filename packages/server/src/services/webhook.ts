import { db } from "../db";
import {
	type NewWebhook,
	type NewWebhookDelivery,
	type Webhook,
	webhookDeliveries,
	webhooks,
} from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { nanoid } from "nanoid";

// Types
export interface WebhookEvent {
	event: "deployment.started" | "deployment.success" | "deployment.failed" | "deployment.cancelled";
	timestamp: string;
	deployment: {
		id: string;
		status: string;
		startedAt: string;
		finishedAt?: string;
		duration?: number;
	};
	application?: {
		id: string;
		name: string;
		type: string;
		url?: string;
		domains?: string[];
	};
	compose?: {
		id: string;
		name: string;
		type: string;
		url?: string;
	};
	project: {
		id: string;
		name: string;
	};
	source?: {
		type: string;
		branch?: string;
		commit?: string;
		repository?: string;
	};
	trigger: {
		type: "webhook" | "manual" | "schedule";
		triggeredBy: string;
	};
	error?: {
		message: string;
		stage?: string;
		logs?: string;
	};
}

// Webhook CRUD operations
export const createWebhook = async (data: NewWebhook): Promise<Webhook> => {
	// Secret is optional - only set if user provides one
	const result = await db.insert(webhooks).values(data).returning();
	return result[0] as Webhook;
};

export const updateWebhook = async (
	webhookId: string,
	data: Partial<NewWebhook>
): Promise<Webhook | undefined> => {
	const result = await db
		.update(webhooks)
		.set(data)
		.where(eq(webhooks.webhookId, webhookId))
		.returning();
	return result[0];
};

export const deleteWebhook = async (webhookId: string): Promise<void> => {
	await db.delete(webhooks).where(eq(webhooks.webhookId, webhookId));
};

export const findWebhookById = async (
	webhookId: string
): Promise<Webhook | undefined> => {
	const result = await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.webhookId, webhookId))
		.limit(1);
	return result[0];
};

export const findWebhooksByApplication = async (
	applicationId: string
): Promise<Webhook[]> => {
	return await db
		.select()
		.from(webhooks)
		.where(
			and(
				eq(webhooks.applicationId, applicationId),
				eq(webhooks.enabled, true)
			)
		);
};

export const findWebhooksByCompose = async (
	composeId: string
): Promise<Webhook[]> => {
	return await db
		.select()
		.from(webhooks)
		.where(
			and(
				eq(webhooks.composeId, composeId),
				eq(webhooks.enabled, true)
			)
		);
};

export const findAllWebhooksByApplication = async (
	applicationId: string
): Promise<Webhook[]> => {
	return await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.applicationId, applicationId));
};

export const findAllWebhooksByCompose = async (
	composeId: string
): Promise<Webhook[]> => {
	return await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.composeId, composeId));
};

// Webhook delivery and execution
export const triggerWebhooks = async (
	entityId: string,
	entityType: "application" | "compose",
	event: WebhookEvent
): Promise<void> => {
	const entityWebhooks = entityType === "application" 
		? await findWebhooksByApplication(entityId)
		: await findWebhooksByCompose(entityId);

	// Filter webhooks that subscribe to this event
	const relevantWebhooks = entityWebhooks.filter((webhook) => {
		const events = webhook.events as string[];
		return events.includes(event.event);
	});

	// Trigger all webhooks in parallel
	await Promise.allSettled(
		relevantWebhooks.map((webhook) => sendWebhook(webhook, event))
	);
};

export const sendWebhook = async (
	webhook: Webhook,
	event: WebhookEvent
): Promise<void> => {
	const startTime = Date.now();
	const deliveryId = nanoid();

	try {
		// Prepare payload based on template type
		const payload = formatPayload(webhook, event);
		
		// Generate HMAC signature
		const signature = generateSignature(webhook.secret || "", JSON.stringify(payload));
		
		// Prepare headers
		const headers: HeadersInit = {
			"Content-Type": "application/json",
			"X-Dokploy-Event": event.event,
			"X-Dokploy-Signature": signature,
			"X-Dokploy-Delivery": deliveryId,
			...(webhook.headers as Record<string, string> || {}),
		};

		// Send webhook
		const response = await fetch(webhook.url, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(10000), // 10 second timeout
		});

		const responseTime = Date.now() - startTime;

		// Log delivery
		await logDelivery({
			webhookId: webhook.webhookId,
			event: event.event,
			payload,
			statusCode: response.status.toString(),
			responseTime: responseTime.toString(),
			attempts: "1",
		});

		// Retry if failed
		if (!response.ok && response.status >= 500) {
			await scheduleRetry(webhook, event, 1);
		}
	} catch (error) {
		const responseTime = Date.now() - startTime;
		
		// Log failed delivery
		await logDelivery({
			webhookId: webhook.webhookId,
			event: event.event,
			payload: event,
			statusCode: "0",
			responseTime: responseTime.toString(),
			error: error instanceof Error ? error.message : "Unknown error",
			attempts: "1",
		});

		// Schedule retry
		await scheduleRetry(webhook, event, 1);
	}
};

// Format payload based on template type
const formatPayload = (webhook: Webhook, event: WebhookEvent): any => {
	switch (webhook.templateType) {
		case "slack":
			return formatSlackPayload(event);
		case "n8n":
			return formatN8nPayload(event);
		case "generic":
		default:
			if (webhook.customTemplate) {
				return processCustomTemplate(webhook.customTemplate, event);
			}
			return event;
	}
};

// Format payload for Slack
const formatSlackPayload = (event: WebhookEvent): any => {
	const emoji = {
		"deployment.started": "🚀",
		"deployment.success": "✅",
		"deployment.failed": "❌",
		"deployment.cancelled": "⚠️",
	}[event.event];

	const color = {
		"deployment.started": "#0088cc",
		"deployment.success": "#00cc00",
		"deployment.failed": "#cc0000",
		"deployment.cancelled": "#ffaa00",
	}[event.event];

	const title = {
		"deployment.started": "Deployment Started",
		"deployment.success": "Deployment Successful",
		"deployment.failed": "Deployment Failed",
		"deployment.cancelled": "Deployment Cancelled",
	}[event.event];

	const fields: any[] = [
		{
			title: "Project",
			value: event.project.name,
			short: true,
		},
		{
			title: event.application ? "Application" : "Compose",
			value: event.application?.name || event.compose?.name,
			short: true,
		},
	];

	if (event.source?.branch) {
		fields.push({
			title: "Branch",
			value: event.source.branch,
			short: true,
		});
	}

	if (event.deployment.duration) {
		fields.push({
			title: "Duration",
			value: `${Math.round(event.deployment.duration / 1000)}s`,
			short: true,
		});
	}

	if (event.error?.message) {
		fields.push({
			title: "Error",
			value: event.error.message,
			short: false,
		});
	}

	return {
		attachments: [
			{
				color,
				title: `${emoji} ${title}`,
				text: event.application?.url || event.compose?.url || "",
				fields,
				footer: "Dokploy",
				footer_icon: "https://dokploy.com/icon.svg",
				ts: Math.floor(new Date(event.timestamp).getTime() / 1000),
			},
		],
	};
};

// Format payload for n8n
const formatN8nPayload = (event: WebhookEvent): any => {
	return {
		event: event.event,
		timestamp: event.timestamp,
		data: {
			deployment: event.deployment,
			entity: event.application || event.compose,
			project: event.project,
			source: event.source,
			trigger: event.trigger,
			error: event.error,
		},
	};
};

// Process custom template with variable substitution
const processCustomTemplate = (template: string, event: WebhookEvent): any => {
	try {
		// Replace variables in template
		let processed = template;
		const variables: Record<string, any> = {
			event: event.event,
			timestamp: event.timestamp,
			deploymentId: event.deployment.id,
			deploymentStatus: event.deployment.status,
			applicationId: event.application?.id,
			applicationName: event.application?.name,
			composeId: event.compose?.id,
			composeName: event.compose?.name,
			projectId: event.project.id,
			projectName: event.project.name,
			branch: event.source?.branch,
			commit: event.source?.commit,
			repository: event.source?.repository,
			errorMessage: event.error?.message,
			duration: event.deployment.duration,
			url: event.application?.url || event.compose?.url,
		};

		for (const [key, value] of Object.entries(variables)) {
			if (value !== undefined) {
				processed = processed.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
			}
		}

		return JSON.parse(processed);
	} catch {
		// If template is invalid, return default payload
		return event;
	}
};

// Generate HMAC signature
const generateSignature = (secret: string, payload: string): string => {
	return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

// Log webhook delivery
const logDelivery = async (data: NewWebhookDelivery): Promise<void> => {
	await db.insert(webhookDeliveries).values(data);
	
	// Keep only last 100 deliveries per webhook
	const deliveries = await db
		.select()
		.from(webhookDeliveries)
		.where(eq(webhookDeliveries.webhookId, data.webhookId))
		.orderBy(desc(webhookDeliveries.deliveredAt));
	
	if (deliveries.length > 100) {
		const toDelete = deliveries.slice(100);
		await Promise.all(
			toDelete.map((d) =>
				db
					.delete(webhookDeliveries)
					.where(eq(webhookDeliveries.deliveryId, d.deliveryId))
			)
		);
	}
};

// Schedule webhook retry
const scheduleRetry = async (
	webhook: Webhook,
	event: WebhookEvent,
	attempt: number
): Promise<void> => {
	if (attempt >= 3) {
		// Max retries reached
		return;
	}

	// Calculate delay: 30s, 2m, 5m
	const delays = [30000, 120000, 300000];
	const delay = delays[attempt - 1];

	setTimeout(async () => {
		try {
			await sendWebhook(webhook, event);
		} catch {
			// Log retry failure and schedule next retry if applicable
			await scheduleRetry(webhook, event, attempt + 1);
		}
	}, delay);
};

// Test webhook
export const testWebhook = async (webhookId: string): Promise<void> => {
	const webhook = await findWebhookById(webhookId);
	if (!webhook) {
		throw new Error("Webhook not found");
	}

	const testEvent: WebhookEvent = {
		event: "deployment.success",
		timestamp: new Date().toISOString(),
		deployment: {
			id: "test-deployment-id",
			status: "done",
			startedAt: new Date(Date.now() - 60000).toISOString(),
			finishedAt: new Date().toISOString(),
			duration: 60000,
		},
		application: webhook.applicationId ? {
			id: webhook.applicationId,
			name: "Test Application",
			type: "application",
			url: "https://test-app.example.com",
			domains: ["test-app.example.com"],
		} : undefined,
		compose: webhook.composeId ? {
			id: webhook.composeId,
			name: "Test Compose",
			type: "compose",
			url: "https://test-compose.example.com",
		} : undefined,
		project: {
			id: "test-project-id",
			name: "Test Project",
		},
		source: {
			type: "github",
			branch: "main",
			commit: "abc123",
			repository: "dokploy/test",
		},
		trigger: {
			type: "manual",
			triggeredBy: "test",
		},
	};

	await sendWebhook(webhook, testEvent);
};

// Get webhook deliveries
export const getWebhookDeliveries = async (
	webhookId: string,
	limit = 20
) => {
	return await db
		.select()
		.from(webhookDeliveries)
		.where(eq(webhookDeliveries.webhookId, webhookId))
		.orderBy(desc(webhookDeliveries.deliveredAt))
		.limit(limit);
};