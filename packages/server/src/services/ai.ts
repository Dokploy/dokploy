import { db } from "@dokploy/server/db";
import { ai } from "@dokploy/server/db/schema";
import { selectAIProvider } from "@dokploy/server/utils/ai/select-ai-provider";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { IS_CLOUD } from "../constants";
import { findServerById } from "./server";
import { findOrganizationById } from "./admin";

export const getAiSettingsByOrganizationId = async (organizationId: string) => {
	const aiSettings = await db.query.ai.findMany({
		where: eq(ai.organizationId, organizationId),
		orderBy: desc(ai.createdAt),
	});
	return aiSettings;
};

export const getAiSettingById = async (aiId: string) => {
	const aiSetting = await db.query.ai.findFirst({
		where: eq(ai.aiId, aiId),
	});
	if (!aiSetting) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "AI settings not found",
		});
	}
	return aiSetting;
};

export const saveAiSettings = async (organizationId: string, settings: any) => {
	const aiId = settings.aiId;

	return db
		.insert(ai)
		.values({
			aiId,
			organizationId,
			...settings,
		})
		.onConflictDoUpdate({
			target: ai.aiId,
			set: {
				...settings,
			},
		});
};

export const deleteAiSettings = async (aiId: string) => {
	return db.delete(ai).where(eq(ai.aiId, aiId));
};

interface Props {
	organizationId: string;
	aiId: string;
	input: string;
	serverId?: string | undefined;
}

export const suggestVariants = async ({
	organizationId,
	aiId,
	input,
	serverId,
}: Props) => {
	try {
		const aiSettings = await getAiSettingById(aiId);
		if (!aiSettings || !aiSettings.isEnabled) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "AI features are not enabled for this configuration",
			});
		}

		const provider = selectAIProvider(aiSettings);
		const model = provider(aiSettings.model);

		let ip = "";
		if (!IS_CLOUD) {
			const organization = await findOrganizationById(organizationId);
			ip = organization?.owner.serverIp || "";
		}

		if (serverId) {
			const server = await findServerById(serverId);
			ip = server.ipAddress;
		} else if (process.env.NODE_ENV === "development") {
			ip = "127.0.0.1";
		}

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
        should include id, name, shortDescription, and description. Use slug of title for id. The description should be in markdown format with full description of suggested stack. The shortDescription should be in plain text and have short information about used technologies.
        User wants to create a new project with the following details, it should be installable in docker and can be docker compose generated for it:
        
        ${input}
      `,
		});

		if (object?.length) {
			const result = [];
			for (const suggestion of object) {
				try {
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
							domains: z.array(
								z.object({
									host: z.string(),
									port: z.number(),
									serviceName: z.string(),
								}),
							),
						}),
						prompt: `
              Act as advanced DevOps engineer and generate docker compose with environment variables and domain configurations needed to install the following project.
              Return the docker compose as a YAML string. Follow these rules:
              1. Use placeholder like \${VARIABLE_NAME-default} for generated variables
              2. Use complex values for passwords/secrets variables
              3. Don't set container_name field in services
              4. Don't set version field in the docker compose
              5. Don't set ports like 'ports: 3000:3000', use 'ports: "3000"' instead
              6. Use dokploy-network in all services
              7. Add dokploy-network at the end and mark it as external: true
              
              For each service that needs to be exposed to the internet:
              1. Define a domain configuration with:
                - host: the domain name for the service in format: {service-name}-{random-3-chars-hex}-${ip ? ip.replaceAll(".", "-") : ""}.traefik.me
                - port: the internal port the service runs on
                - serviceName: the name of the service in the docker-compose
              2. Make sure the service is properly configured in the docker-compose to work with the specified port
              
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
				} catch (error) {
					console.error("Error in docker compose generation:", error);
				}
			}
			return result;
		}

		throw new TRPCError({
			code: "NOT_FOUND",
			message: "No suggestions found",
		});
	} catch (error) {
		console.error("Error in suggestVariants:", error);
		throw error;
	}
};
