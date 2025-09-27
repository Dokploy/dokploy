import { IS_CLOUD } from "@dokploy/server/constants";
import {
	apiCreateAi,
	apiUpdateAi,
	deploySuggestionSchema,
} from "@dokploy/server/db/schema/ai";
import {
	createDomain,
	createMount,
	findEnvironmentById,
} from "@dokploy/server/index";
import {
	deleteAiSettings,
	getAiSettingById,
	getAiSettingsByOrganizationId,
	saveAiSettings,
	suggestVariants,
} from "@dokploy/server/services/ai";
import { createComposeByTemplate } from "@dokploy/server/services/compose";
import { findProjectById } from "@dokploy/server/services/project";
import {
	addNewService,
	checkServiceAccess,
} from "@dokploy/server/services/user";
import {
	getProviderHeaders,
	getProviderName,
	type Model,
} from "@dokploy/server/utils/ai/select-ai-provider";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { generatePassword } from "@/templates/utils";

export const aiRouter = createTRPCRouter({
	one: protectedProcedure
		.input(z.object({ aiId: z.string() }))
		.query(async ({ ctx, input }) => {
			const aiSetting = await getAiSettingById(input.aiId);
			if (aiSetting.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this AI configuration",
				});
			}
			return aiSetting;
		}),

	getModels: protectedProcedure
		.input(z.object({ apiUrl: z.string().min(1), apiKey: z.string() }))
		.query(async ({ input }) => {
			try {
				const providerName = getProviderName(input.apiUrl);
				const headers = getProviderHeaders(input.apiUrl, input.apiKey);
				let response = null;
				switch (providerName) {
					case "ollama":
						response = await fetch(`${input.apiUrl}/api/tags`, { headers });
						break;
					default:
						if (!input.apiKey)
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "API key must contain at least 1 character(s)",
							});
						response = await fetch(`${input.apiUrl}/models`, { headers });
				}

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Failed to fetch models: ${errorText}`);
				}

				const res = await response.json();

				if (Array.isArray(res)) {
					return res.map((model) => ({
						id: model.id || model.name,
						object: "model",
						created: Date.now(),
						owned_by: "provider",
					}));
				}

				if (res.models) {
					return res.models.map((model: any) => ({
						id: model.id || model.name,
						object: "model",
						created: Date.now(),
						owned_by: "provider",
					})) as Model[];
				}

				if (res.data) {
					return res.data as Model[];
				}

				const possibleModels =
					(Object.values(res).find(Array.isArray) as any[]) || [];
				return possibleModels.map((model) => ({
					id: model.id || model.name,
					object: "model",
					created: Date.now(),
					owned_by: "provider",
				})) as Model[];
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	create: adminProcedure.input(apiCreateAi).mutation(async ({ ctx, input }) => {
		return await saveAiSettings(ctx.session.activeOrganizationId, input);
	}),

	update: protectedProcedure
		.input(apiUpdateAi)
		.mutation(async ({ ctx, input }) => {
			return await saveAiSettings(ctx.session.activeOrganizationId, input);
		}),

	getAll: adminProcedure.query(async ({ ctx }) => {
		return await getAiSettingsByOrganizationId(
			ctx.session.activeOrganizationId,
		);
	}),

	get: protectedProcedure
		.input(z.object({ aiId: z.string() }))
		.query(async ({ ctx, input }) => {
			const aiSetting = await getAiSettingById(input.aiId);
			if (aiSetting.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this AI configuration",
				});
			}
			return aiSetting;
		}),

	delete: protectedProcedure
		.input(z.object({ aiId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const aiSetting = await getAiSettingById(input.aiId);
			if (aiSetting.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this AI configuration",
				});
			}
			return await deleteAiSettings(input.aiId);
		}),

	suggest: protectedProcedure
		.input(
			z.object({
				aiId: z.string(),
				input: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				return await suggestVariants({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	deploy: protectedProcedure
		.input(deploySuggestionSchema)
		.mutation(async ({ ctx, input }) => {
			const environment = await findEnvironmentById(input.environmentId);
			const project = await findProjectById(environment.projectId);
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.session.activeOrganizationId,
					environment.projectId,
					"create",
				);
			}

			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a compose",
				});
			}

			const projectName = slugify(`${project.name} ${input.id}`);

			const compose = await createComposeByTemplate({
				...input,
				composeFile: input.dockerCompose,
				env: input.envVariables,
				serverId: input.serverId,
				name: input.name,
				sourceType: "raw",
				appName: `${projectName}-${generatePassword(6)}`,
				isolatedDeployment: true,
				environmentId: input.environmentId,
			});

			if (input.domains && input.domains?.length > 0) {
				for (const domain of input.domains) {
					await createDomain({
						...domain,
						domainType: "compose",
						certificateType: "none",
						composeId: compose.composeId,
					});
				}
			}
			if (input.configFiles && input.configFiles?.length > 0) {
				for (const mount of input.configFiles) {
					await createMount({
						filePath: mount.filePath,
						mountPath: "",
						content: mount.content,
						serviceId: compose.composeId,
						serviceType: "compose",
						type: "file",
					});
				}
			}

			if (ctx.user.role === "member") {
				await addNewService(
					ctx.session.activeOrganizationId,
					ctx.user.ownerId,
					compose.composeId,
				);
			}

			return null;
		}),

	analyzeDeploymentError: protectedProcedure
		.input(
			z.object({
				serviceType: z.enum(["application", "compose"]),
				serviceId: z.string(),
				error: z.string(),
				aiId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const aiConfig = await getAiSettingById(input.aiId);

				if (aiConfig.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this AI configuration",
					});
				}

				let serviceData: any = {};
				if (input.serviceType === "application") {
					const { findApplicationById } = await import("@dokploy/server/services/application");
					serviceData = await findApplicationById(input.serviceId);
				} else {
					const { findComposeById } = await import("@dokploy/server/services/compose");
					serviceData = await findComposeById(input.serviceId);
				}

				const prompt = `Analyze this Docker deployment error and provide only the essential fix.

Service: ${serviceData.name || "Unknown"} (${input.serviceType})
${input.serviceType === "compose" ? `Docker Compose:\n${serviceData.composeFile || "Not available"}` : ""}
${input.serviceType === "application" ? `Build Type: ${serviceData.buildType || "Unknown"}` : ""}

Error:
${input.error}

Explain the main problem and the exact fix needed. Be direct and skip optional warnings. Maximum 2 sentences. No markdown or code blocks.`;

				const providerName = getProviderName(aiConfig.apiUrl);
				const baseHeaders = getProviderHeaders(aiConfig.apiUrl, aiConfig.apiKey);
				const headers = {
					...baseHeaders,
					"Content-Type": "application/json",
				};

				let response: Response;
				if (providerName === "ollama") {
					response = await fetch(`${aiConfig.apiUrl}/api/generate`, {
						method: "POST",
						headers,
						body: JSON.stringify({
							model: aiConfig.model,
							prompt,
							stream: false,
						}),
					});
				} else {
					response = await fetch(`${aiConfig.apiUrl}/chat/completions`, {
						method: "POST",
						headers,
						body: JSON.stringify({
							model: aiConfig.model,
							messages: [{ role: "user", content: prompt }],
						}),
					});
				}

				if (!response.ok) {
					throw new Error(`AI API error: ${response.statusText}`);
				}

				const result = await response.json();
				let analysis: string;

				if (providerName === "ollama") {
					analysis = result.response;
				} else {
					analysis = result.choices?.[0]?.message?.content || "No analysis available";
				}

				return { analysis };
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error instanceof Error ? error.message : "Failed to analyze error",
				});
			}
		}),
});
