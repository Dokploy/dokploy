import { db } from "@dokploy/server/db";
import { ai } from "@dokploy/server/db/schema";
import { selectAIProvider } from "@dokploy/server/utils/ai/select-ai-provider";
import { TRPCError } from "@trpc/server";
import { generateText, Output } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { IS_CLOUD } from "../constants";
import { findServerById } from "./server";
import { getWebServerSettings } from "./web-server-settings";

interface SuggestionItem {
	id: string;
	name: string;
	shortDescription: string;
	description: string;
}

interface SuggestionsOutput {
	suggestions: SuggestionItem[];
}

interface DockerOutput {
	dockerCompose: string;
	envVariables: Array<{ name: string; value: string }>;
	domains: Array<{ host: string; port: number; serviceName: string }>;
	configFiles?: Array<{ content: string; filePath: string }>;
}

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
	organizationId: _organizationId,
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
			const settings = await getWebServerSettings();
			ip = settings?.serverIp || "";
		}

		if (serverId) {
			const server = await findServerById(serverId);
			ip = server.ipAddress;
		} else if (process.env.NODE_ENV === "development") {
			ip = "127.0.0.1";
		}

		const suggestionsSchema = z.object({
			suggestions: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					shortDescription: z.string(),
					description: z.string(),
				}),
			),
		});
		const suggestionsResult = await generateText({
			model,
			// @ts-ignore - Zod + AI SDK Output.object() causes excessively deep instantiation
			output: Output.object({ schema: suggestionsSchema }),
			prompt: `
		    Act as advanced DevOps engineer and analyze the user's request to determine the appropriate suggestions (up to 3 items).

		    CRITICAL - Read the user's request carefully and follow the appropriate strategy:

		    Strategy A - If the user specifies a PARTICULAR APPLICATION/SERVICE (e.g., "deploy Chatwoot", "install sendingtk/chatwoot:develop", "setup Bitwarden"):
		    - Generate different deployment VARIANTS of that SAME application
		    - Each variant should be a different configuration (minimal, full stack, with different databases, development vs production, etc.)
		    - Example: For "Chatwoot" → "Chatwoot with PostgreSQL", "Chatwoot Development", "Chatwoot Full Stack"
		    - The name MUST include the specific application name the user mentioned

		    Strategy B - If the user describes a GENERAL NEED or USE CASE (e.g., "personal blog", "project management tool", "chat application"):
		    - Suggest different open source projects that fulfill that need
		    - Each suggestion should be a different tool/platform that solves the same problem
		    - Example: For "personal blog" → "WordPress", "Ghost", "Hugo with Nginx"
		    - The name should be the actual project name

		    Return your response as a JSON object with the following structure:
		    {
		      "suggestions": [
		        {
		          "id": "project-or-variant-slug",
		          "name": "Project Name or Variant Name",
		          "shortDescription": "Brief one-line description",
		          "description": "Detailed description"
		        }
		      ]
		    }

		    Important rules for the response:
		    1. Use slug format for the id field (lowercase, hyphenated)
		    2. Determine which strategy to use based on whether the user specified a particular application or described a general need
		    3. For Strategy A (specific app): The name must include the app name and describe the variant configuration
		    4. For Strategy B (general need): The name should be the actual project/tool name that fulfills the need
		    5. The description field should ONLY contain a plain text description of the project or variant, its features, and use cases
		    6. Do NOT include any code snippets, configuration examples, or installation instructions in the description
		    7. The shortDescription should be a single-line summary focusing on key technologies or differentiators
		    8. All suggestions should be installable in docker and have docker compose support
		    9. Provide variety in your suggestions - different complexity levels, tech stacks, or approaches

		    User wants to create a new project with the following details:

		    ${input}
		  `,
		});
		const object = suggestionsResult.output as SuggestionsOutput | undefined;

		if (object?.suggestions?.length) {
			const dockerSchema = z.object({
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
				configFiles: z
					.array(
						z.object({
							content: z.string(),
							filePath: z.string(),
						}),
					)
					.optional(),
			});
			const result = [];
			for (const suggestion of object.suggestions) {
				try {
					const dockerResult = await generateText({
						model,
						// @ts-ignore - Zod + AI SDK Output.object() causes excessively deep instantiation
						output: Output.object({ schema: dockerSchema }),
						prompt: `
		          Act as advanced DevOps engineer and generate docker compose with environment variables and domain configurations needed to install the following project.

		          Return your response as a JSON object with this structure:
		          {
		            "dockerCompose": "yaml string here",
		            "envVariables": [{"name": "VAR_NAME", "value": "example_value"}],
		            "domains": [{"host": "domain.com", "port": 3000, "serviceName": "service"}],
		            "configFiles": [{"content": "file content", "filePath": "path/to/file"}]
		          }

		          Note: configFiles is optional - only include it if configuration files are absolutely required.

		          Follow these rules:

		          Docker Compose Rules:
		          1. Use placeholder like \${VARIABLE_NAME-default} for generated variables in the docker-compose.yml
		          2. Use complex values for passwords/secrets variables
		          3. Don't set container_name field in services
		          4. Don't set version field in the docker compose
		          5. Don't set ports like 'ports: 3000:3000', use 'ports: "3000"' instead
		          6. If a service depends on a database or other service, INCLUDE that service in the docker-compose
		          7. Make sure all required services are defined in the docker-compose

		          Docker Image Rules (CRITICAL):
		          1. ALWAYS use 'image:' field, NEVER use 'build:' field
		          2. NEVER use 'build: .' or any build directive - we don't have local Dockerfiles
		          3. Use images from Docker Hub or other public registries (e.g., docker.io, ghcr.io, quay.io)
		          4. For dependencies (databases, redis, etc.), use official images (e.g., postgres:16, redis:7, etc.)
		          5. Always specify image tags - avoid using 'latest' tag, use specific versions when possible
		          6. Examples of correct image usage:
		             - image: sendingtk/chatwoot:develop
		             - image: postgres:16-alpine
		             - image: redis:7-alpine
		             - image: chatwoot/chatwoot:latest
		          7. Examples of INCORRECT usage (DO NOT USE):
		             - build: .
		             - build: ./app
		             - build:
		                 context: .
		                 dockerfile: Dockerfile

				  Volume Mounting and Configuration Rules:
		          1. DO NOT create configuration files unless the service CANNOT work without them
		          2. Most services can work with just environment variables - USE THEM FIRST
		          3. Ask yourself: "Can this be configured with an environment variable instead?"
		          4. If and ONLY IF a config file is absolutely required:
		             - Keep it minimal with only critical settings
		             - Use "../files/" prefix for all mounts
		             - Format: "../files/folder:/container/path"
		          5. DO NOT add configuration files for:
		             - Default configurations that work out of the box
		             - Settings that can be handled by environment variables
		             - Proxy or routing configurations (these are handled elsewhere)

				  Environment Variables Rules:
		          1. For the envVariables array, provide ACTUAL example values, not placeholders
		          2. Use realistic example values (e.g., "admin@example.com" for emails, "mypassword123" for passwords)
				  3. DO NOT use \${VARIABLE_NAME-default} syntax in the envVariables values
		          4. ONLY include environment variables that are actually used in the docker-compose
		          5. Every environment variable referenced in the docker-compose MUST have a corresponding entry in envVariables
		          6. Do not include environment variables for services that don't exist in the docker-compose

		          For each service that needs to be exposed to the internet:
		          1. Define a domain configuration with:
		            - host: the domain name for the service in format: {service-name}-{random-3-chars-hex}-${ip ? ip.replaceAll(".", "-") : ""}.traefik.me
		            - port: the internal port the service runs on
		            - serviceName: the name of the service in the docker-compose
		          2. Make sure the service is properly configured to work with the specified port

		          User's original request: ${input}

		          Project details:
		          ${suggestion?.description}
		        `,
					});
					const docker = dockerResult.output as DockerOutput | undefined;
					if (docker?.dockerCompose) {
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
