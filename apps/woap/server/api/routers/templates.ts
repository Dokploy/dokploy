import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	getAllWoapTemplates,
	getWoapTemplateById,
} from "@/templates/woap-starters";
import { TRPCError } from "@trpc/server";

export const templatesRouter = createTRPCRouter({
	// Get all available templates
	getAll: protectedProcedure.query(async () => {
		return getAllWoapTemplates();
	}),

	// Get a specific template by ID
	getById: protectedProcedure
		.input(
			z.object({
				templateId: z.string(),
				projectName: z.string(),
				serverIp: z.string().default(""),
			}),
		)
		.query(async ({ input }) => {
			const template = getWoapTemplateById(
				input.templateId,
				input.projectName,
				input.serverIp,
			);

			if (!template) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Template with ID "${input.templateId}" not found`,
				});
			}

			return template;
		}),

	// Deploy a template (creates compose with the template configuration)
	deploy: protectedProcedure
		.input(
			z.object({
				templateId: z.string(),
				projectName: z.string(),
				environmentId: z.string(),
				serverIp: z.string().default(""),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const template = getWoapTemplateById(
				input.templateId,
				input.projectName,
				input.serverIp,
			);

			if (!template) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Template with ID "${input.templateId}" not found`,
				});
			}

			// Return template data that can be used with the deploy endpoint
			// The actual deployment will be handled by the compose deployment system
			return {
				template,
				message: `Template "${template.name}" ready for deployment`,
			};
		}),
});
