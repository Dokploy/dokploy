import { relations } from "drizzle-orm";
import { boolean, json, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";

export const webhooks = pgTable("webhook", {
	webhookId: text("webhookId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{
			onDelete: "cascade",
		},
	),
	composeId: text("composeId").references(() => compose.composeId, {
		onDelete: "cascade",
	}),
	name: text("name").notNull(),
	url: text("url").notNull(),
	secret: text("secret"),
	templateType: text("templateType").notNull().default("generic"), // 'slack', 'n8n', 'generic'
	customTemplate: text("customTemplate"),
	events: json("events").$type<string[]>().notNull().default([]), // ['deployment.started', 'deployment.success', 'deployment.failed', 'deployment.cancelled']
	headers: json("headers").$type<Record<string, string>>().default({}),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt").$onUpdate(() => new Date().toISOString()),
});

export const webhookDeliveries = pgTable("webhook_delivery", {
	deliveryId: text("deliveryId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookId: text("webhookId")
		.notNull()
		.references(() => webhooks.webhookId, {
			onDelete: "cascade",
		}),
	event: text("event").notNull(),
	payload: json("payload").notNull(),
	statusCode: text("statusCode"),
	responseTime: text("responseTime"), // in milliseconds
	error: text("error"),
	attempts: text("attempts").notNull().default("1"),
	deliveredAt: text("deliveredAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
	application: one(applications, {
		fields: [webhooks.applicationId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [webhooks.composeId],
		references: [compose.composeId],
	}),
	deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(
	webhookDeliveries,
	({ one }) => ({
		webhook: one(webhooks, {
			fields: [webhookDeliveries.webhookId],
			references: [webhooks.webhookId],
		}),
	}),
);

// Schemas
const createWebhookSchema = createInsertSchema(webhooks, {
	url: z.string().url("Must be a valid HTTPS URL").startsWith("https://"),
	events: z
		.array(
			z.enum([
				"deployment.started",
				"deployment.success",
				"deployment.failed",
				"deployment.cancelled",
			]),
		)
		.min(1, "At least one event must be selected"),
	templateType: z.enum(["slack", "n8n", "generic"]).default("generic"),
	headers: z.record(z.string()).optional(),
});

export const apiCreateWebhook = createWebhookSchema
	.pick({
		name: true,
		url: true,
		secret: true,
		templateType: true,
		customTemplate: true,
		events: true,
		headers: true,
		enabled: true,
		applicationId: true,
		composeId: true,
	})
	.refine(
		(data) => data.applicationId || data.composeId,
		"Either applicationId or composeId must be provided",
	);

export const apiUpdateWebhook = createWebhookSchema
	.pick({
		name: true,
		url: true,
		secret: true,
		templateType: true,
		customTemplate: true,
		events: true,
		headers: true,
		enabled: true,
	})
	.partial()
	.extend({
		webhookId: z.string(),
	});

export const apiFindWebhookById = z.object({
	webhookId: z.string(),
});

export const apiFindWebhooksByApplication = z.object({
	applicationId: z.string(),
});

export const apiFindWebhooksByCompose = z.object({
	composeId: z.string(),
});

export const apiTestWebhook = z.object({
	webhookId: z.string(),
});

export const apiDeleteWebhook = z.object({
	webhookId: z.string(),
});

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
