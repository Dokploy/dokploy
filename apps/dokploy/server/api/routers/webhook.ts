import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateWebhook,
	apiUpdateWebhook,
	apiFindWebhookById,
	apiFindWebhooksByApplication,
	apiFindWebhooksByCompose,
	apiTestWebhook,
	apiDeleteWebhook,
} from "@/server/db/schema";
import {
	createWebhook,
	updateWebhook,
	deleteWebhook,
	findWebhookById,
	findAllWebhooksByApplication,
	findAllWebhooksByCompose,
	testWebhook,
	getWebhookDeliveries,
} from "@dokploy/server/services/webhook";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const webhookRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateWebhook)
		.mutation(async ({ input }) => {
			try {
				const webhook = await createWebhook(input);
				return webhook;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating webhook",
					cause: error,
				});
			}
		}),

	update: protectedProcedure
		.input(apiUpdateWebhook)
		.mutation(async ({ input }) => {
			try {
				const { webhookId, ...data } = input;
				const webhook = await updateWebhook(webhookId, data);
				if (!webhook) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Webhook not found",
					});
				}
				return webhook;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating webhook",
					cause: error,
				});
			}
		}),

	delete: protectedProcedure
		.input(apiDeleteWebhook)
		.mutation(async ({ input }) => {
			try {
				await deleteWebhook(input.webhookId);
				return { success: true };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting webhook",
					cause: error,
				});
			}
		}),

	findById: protectedProcedure
		.input(apiFindWebhookById)
		.query(async ({ input }) => {
			const webhook = await findWebhookById(input.webhookId);
			if (!webhook) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Webhook not found",
				});
			}
			return webhook;
		}),

	findByApplication: protectedProcedure
		.input(apiFindWebhooksByApplication)
		.query(async ({ input }) => {
			const webhooks = await findAllWebhooksByApplication(input.applicationId);
			return webhooks;
		}),

	findByCompose: protectedProcedure
		.input(apiFindWebhooksByCompose)
		.query(async ({ input }) => {
			const webhooks = await findAllWebhooksByCompose(input.composeId);
			return webhooks;
		}),

	test: protectedProcedure
		.input(apiTestWebhook)
		.mutation(async ({ input }) => {
			try {
				await testWebhook(input.webhookId);
				return { success: true, message: "Test webhook sent successfully" };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to send test webhook: ${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),

	getDeliveries: protectedProcedure
		.input(
			z.object({
				webhookId: z.string(),
				limit: z.number().min(1).max(100).default(20),
			})
		)
		.query(async ({ input }) => {
			try {
				const deliveries = await getWebhookDeliveries(
					input.webhookId,
					input.limit
				);
				return deliveries;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error fetching webhook deliveries",
					cause: error,
				});
			}
		}),

	// Batch operations
	deleteMultiple: protectedProcedure
		.input(
			z.object({
				webhookIds: z.array(z.string()),
			})
		)
		.mutation(async ({ input }) => {
			try {
				const results = await Promise.allSettled(
					input.webhookIds.map((id) => deleteWebhook(id))
				);
				
				const failures = results.filter(r => r.status === "rejected");
				if (failures.length > 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Failed to delete ${failures.length} webhook(s)`,
					});
				}
				
				return { success: true, deleted: input.webhookIds.length };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting webhooks",
					cause: error,
				});
			}
		}),

	// Enable/disable webhook
	toggle: protectedProcedure
		.input(
			z.object({
				webhookId: z.string(),
				enabled: z.boolean(),
			})
		)
		.mutation(async ({ input }) => {
			try {
				const webhook = await updateWebhook(input.webhookId, {
					enabled: input.enabled,
				});
				if (!webhook) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Webhook not found",
					});
				}
				return webhook;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error toggling webhook",
					cause: error,
				});
			}
		}),

	// Get webhook statistics
	getStats: protectedProcedure
		.input(
			z.object({
				webhookId: z.string(),
			})
		)
		.query(async ({ input }) => {
			try {
				const deliveries = await getWebhookDeliveries(input.webhookId, 100);
				
				const stats = {
					total: deliveries.length,
					successful: deliveries.filter(d => d.statusCode && parseInt(d.statusCode) >= 200 && parseInt(d.statusCode) < 300).length,
					failed: deliveries.filter(d => !d.statusCode || parseInt(d.statusCode) >= 400).length,
					avgResponseTime: deliveries.length > 0
						? deliveries.reduce((acc, d) => acc + (parseInt(d.responseTime || "0")), 0) / deliveries.length
						: 0,
					lastDelivery: deliveries[0]?.deliveredAt || null,
				};
				
				return stats;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error fetching webhook statistics",
					cause: error,
				});
			}
		}),
});