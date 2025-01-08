import { db } from "@dokploy/server/db";
import { ai } from "@dokploy/server/db/schema";
import { selectAIProvider } from "@dokploy/server/utils/ai/select-ai-provider";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const getAiSettingsByAuthId = async (authId: string) => {
	const aiSettings = await db.query.ai.findFirst({
		where: eq(ai.authId, authId),
	});
	if (!aiSettings) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "AI settings not found for the user",
		});
	}
	return aiSettings;
};

export const saveAiSettings = async (authId: string, settings: any) => {
	return db
		.insert(ai)
		.values({
			authId,
			...settings,
		})
		.onConflictDoUpdate({
			target: ai.authId,
			set: {
				...settings,
			},
		});
};

export const suggestVariants = async (authId: string, input: string) => {
	const aiSettings = await getAiSettingsByAuthId(authId);
	if (!aiSettings || !aiSettings.isEnabled) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "AI features are not enabled",
		});
	}

	const provider = selectAIProvider(aiSettings);
	const model = provider(aiSettings.model);
	const { object } = await generateObject({
		model,
		output: "array",
		schema: z.object({
			id: z.string(),
			name: z.string(),
			shortDescription: z.string(),
			description: z.string(),
		}),
		prompt: `
			Act as advanced DevOps engineer and generate a list of open source projects what can cover users needs(up to 3 items), the suggestion 
			should include id, name, shortDescription, and description. Use slug of title for id. The description should be in markdown format with full descriription of suggested stack. The shortDescription should be in plain text and have short information about used technologies.
			User wants to create a new project with the following details, it should be installable in docker and can be docker compose generated for it:
			
			${input}
		`,
	});

	if (object?.length) {
		const result = [];
		for (const suggestion of object) {
			const { object: docker } = await generateObject({
				model,
				output: "object",
				schema: z.object({
					dockerCompose: z.string(),
					envVariables: z.array(
						z.object({
							name: z.string(),
							value: z.string(),
						}),
					),
				}),
				prompt: `
			Act as advanced DevOps engineer and generate docker compose with environment variables needed to install the following project, 
			use placeholder like \${VARIABLE_NAME-default} for generated variables in the docker compose. Use complex values for passwords/secrets variables.
			Add networks: [dokploy-network] to all services in docker compose. Don\'t set container_name field in services. 
			
			Add to docker-compose the following network:
			networks:
			  dokploy-network:
				external: true
			
			Project details:
			${suggestion?.description}
		`,
			});
			if (!!docker && !!docker.dockerCompose) {
				result.push({
					...suggestion,
					...docker,
				});
			}
		}
		return result;
	}

	throw new TRPCError({
		code: "NOT_FOUND",
		message: "No suggestions found",
	});
};
