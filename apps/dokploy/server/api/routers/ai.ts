import { IS_CLOUD } from "@dokploy/server/constants";
import {
	apiCreateAi,
	apiUpdateAi,
	deploySuggestionSchema,
} from "@dokploy/server/db/schema/ai";
import {
	createDomain,
	createMount,
	getWebServerSettings,
} from "@dokploy/server/index";
import {
	deleteAiSettings,
	getAiSettingById,
	getAiSettingsByOrganizationId,
	saveAiSettings,
	suggestVariants,
} from "@dokploy/server/services/ai";
import { createComposeByTemplate } from "@dokploy/server/services/compose";
import {
	addNewService,
	checkPermission,
	checkServiceAccess,
} from "@dokploy/server/services/permission";
import {
	assertAIProviderApiUrlAllowed,
	getProviderHeaders,
	getProviderName,
	type Model,
	selectAIProvider,
} from "@dokploy/server/utils/ai/select-ai-provider";
import {
	redactAiSettingsSecrets,
	redactAiSettingsSecretsList,
} from "@dokploy/server/utils/security/redaction";
import { fetchWithPublicEgress } from "@dokploy/server/utils/url/network";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import {
	assertTargetEnvironmentAccess,
	assertTargetServerAccess,
} from "@/server/api/utils/placement-access";
import { generatePassword } from "@/templates/utils";

const appendAIProviderPath = (apiUrl: string, pathname: string) =>
	`${apiUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;

export const aiRouter = createTRPCRouter({
	one: adminProcedure
		.input(z.object({ aiId: z.string() }))
		.query(async ({ ctx, input }) => {
			return redactAiSettingsSecrets(
				await getAiSettingById(input.aiId, ctx.session.activeOrganizationId),
			);
		}),

	getModels: adminProcedure
		.input(z.object({ apiUrl: z.string().min(1), apiKey: z.string() }))
		.query(async ({ input }) => {
			try {
				const apiUrl = await assertAIProviderApiUrlAllowed(input.apiUrl);
				const providerName = getProviderName(apiUrl);
				const headers = getProviderHeaders(apiUrl, input.apiKey);
				let response = null;
				switch (providerName) {
					case "ollama":
						response = await fetchWithPublicEgress(
							appendAIProviderPath(apiUrl, "api/tags"),
							{
								headers,
								redirect: "error",
							},
							{ fieldName: "AI provider URL" },
						);
						break;
					case "gemini": {
						const modelsUrl = new URL(appendAIProviderPath(apiUrl, "models"));
						modelsUrl.searchParams.set("key", input.apiKey);
						response = await fetchWithPublicEgress(
							modelsUrl,
							{
								headers: {},
								redirect: "error",
							},
							{ fieldName: "AI provider URL" },
						);
						break;
					}
					case "perplexity":
						// Perplexity doesn't have a /models endpoint, return hardcoded list
						return [
							{
								id: "sonar-deep-research",
								object: "model",
								created: Date.now(),
								owned_by: "perplexity",
							},
							{
								id: "sonar-reasoning-pro",
								object: "model",
								created: Date.now(),
								owned_by: "perplexity",
							},
							{
								id: "sonar-reasoning",
								object: "model",
								created: Date.now(),
								owned_by: "perplexity",
							},
							{
								id: "sonar-pro",
								object: "model",
								created: Date.now(),
								owned_by: "perplexity",
							},
							{
								id: "sonar",
								object: "model",
								created: Date.now(),
								owned_by: "perplexity",
							},
						] as Model[];
					case "zai":
						return [
							{
								id: "glm-5",
								object: "model",
								created: Date.now(),
								owned_by: "zai",
							},
							{
								id: "glm-4.7",
								object: "model",
								created: Date.now(),
								owned_by: "zai",
							},
						] as Model[];
					case "minimax":
						return [
							{
								id: "MiniMax-M2.7",
								object: "model",
								created: Date.now(),
								owned_by: "minimax",
							},
						] as Model[];
					default:
						if (!input.apiKey) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "API key must contain at least 1 character(s)",
							});
						}
						response = await fetchWithPublicEgress(
							appendAIProviderPath(apiUrl, "models"),
							{
								headers,
								redirect: "error",
							},
							{ fieldName: "AI provider URL" },
						);
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
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	create: adminProcedure.input(apiCreateAi).mutation(async ({ ctx, input }) => {
		return redactAiSettingsSecrets(
			await saveAiSettings(ctx.session.activeOrganizationId, input),
		);
	}),

	update: adminProcedure.input(apiUpdateAi).mutation(async ({ ctx, input }) => {
		return redactAiSettingsSecrets(
			await saveAiSettings(ctx.session.activeOrganizationId, input),
		);
	}),

	getAll: adminProcedure.query(async ({ ctx }) => {
		return redactAiSettingsSecretsList(
			await getAiSettingsByOrganizationId(ctx.session.activeOrganizationId),
		);
	}),

	get: adminProcedure
		.input(z.object({ aiId: z.string() }))
		.query(async ({ ctx, input }) => {
			return redactAiSettingsSecrets(
				await getAiSettingById(input.aiId, ctx.session.activeOrganizationId),
			);
		}),

	delete: adminProcedure
		.input(z.object({ aiId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return await deleteAiSettings(
				input.aiId,
				ctx.session.activeOrganizationId,
			);
		}),

	getEnabledProviders: protectedProcedure.query(async ({ ctx }) => {
		const settings = await getAiSettingsByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		return settings
			.filter((s) => s.isEnabled)
			.map((s) => ({ aiId: s.aiId, name: s.name, model: s.model }));
	}),

	analyzeLogs: adminProcedure
		.input(
			z.object({
				aiId: z.string().min(1),
				logs: z.string().min(1),
				context: z.enum(["build", "runtime"]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const aiSettings = await getAiSettingById(
					input.aiId,
					ctx.session.activeOrganizationId,
				);
				if (!aiSettings?.isEnabled) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "AI provider is not enabled",
					});
				}

				const apiUrl = await assertAIProviderApiUrlAllowed(aiSettings.apiUrl);
				const provider = selectAIProvider({ ...aiSettings, apiUrl });
				const model = provider(aiSettings.model);

				const contextLabel =
					input.context === "build" ? "build/deployment" : "runtime/container";

				const result = await generateText({
					model,
					prompt: `You are a DevOps engineer analyzing ${contextLabel} logs. Analyze the following logs and provide:

1. **Summary**: A brief summary of what's happening
2. **Issues Found**: Any errors, warnings, or problems detected
3. **Root Cause**: The most likely root cause if there are errors
4. **Suggested Fix**: Actionable steps to resolve the issues

Be concise and practical. Focus on the most important issues. If the logs look healthy, say so briefly.

Logs:
${input.logs}`,
				});

				return { analysis: result.text };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: `Analysis failed: ${error}`,
				});
			}
		}),

	testConnection: adminProcedure
		.input(
			z.object({
				apiUrl: z.string().min(1),
				apiKey: z.string(),
				model: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const apiUrl = await assertAIProviderApiUrlAllowed(input.apiUrl);
				const provider = selectAIProvider({
					apiUrl,
					apiKey: input.apiKey,
				});
				const model = provider(input.model);
				const result = await generateText({
					model,
					prompt: "Reply with 'ok'",
				});
				if (!result.text) {
					throw new Error("No response received from the model");
				}
				return { success: true, message: "Connection successful" };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: `Connection failed: ${error}`,
				});
			}
		}),

	suggest: adminProcedure
		.input(
			z.object({
				aiId: z.string(),
				input: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				if (input.serverId) {
					await assertTargetServerAccess(ctx, input.serverId);
				}
				return await suggestVariants({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	deploy: protectedProcedure
		.input(deploySuggestionSchema)
		.mutation(async ({ ctx, input }) => {
			const environment = await assertTargetEnvironmentAccess(
				ctx,
				input.environmentId,
			);
			await checkServiceAccess(ctx, environment.projectId, "create");

			if (input.domains?.length) {
				await checkPermission(ctx, { domain: ["create"] });
			}
			if (input.configFiles?.length) {
				await checkPermission(ctx, { volume: ["create"] });
			}

			const webServerSettings = await getWebServerSettings();
			if (
				(IS_CLOUD || webServerSettings?.remoteServersOnly) &&
				!input.serverId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a compose",
				});
			}

			await assertTargetServerAccess(ctx, input.serverId);

			const projectName = slugify(`${environment.project.name} ${input.id}`);

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

			await addNewService(ctx, compose.composeId);

			return null;
		}),
});
