import { slugify } from "@/lib/slug";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { generatePassword } from "@/templates/utils";
import { IS_CLOUD } from "@dokploy/server/constants";
import {
	apiAiSettingsSchema,
	deploySuggestionSchema,
} from "@dokploy/server/db/schema/ai";
import {
	getAiSettingsByAuthId,
	saveAiSettings,
	suggestVariants,
} from "@dokploy/server/services/ai";
import { createComposeByTemplate } from "@dokploy/server/services/compose";
import { findProjectById } from "@dokploy/server/services/project";
import {
	addNewService,
	checkServiceAccess,
} from "@dokploy/server/services/user";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const aiRouter = createTRPCRouter({
	save: protectedProcedure
		.input(apiAiSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			return await saveAiSettings(ctx.user.authId, input);
		}),
	get: protectedProcedure.query(async ({ ctx }) => {
		return await getAiSettingsByAuthId(ctx.user.authId);
	}),
	suggest: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input }) => {
			return await suggestVariants(ctx.user.authId, input);
		}),
	deploy: protectedProcedure
		.input(deploySuggestionSchema)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(ctx.user.authId, input.projectId, "create");
			}

			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a compose",
				});
			}

			const project = await findProjectById(input.projectId);

			const projectName = slugify(`${project.name} ${input.id}`);

			const compose = await createComposeByTemplate({
				...input,
				composeFile: input.dockerCompose,
				env: input.envVariables,
				serverId: input.serverId,
				name: input.name,
				sourceType: "raw",
				appName: `${projectName}-${generatePassword(6)}`,
			});

			if (ctx.user.rol === "user") {
				await addNewService(ctx.user.authId, compose.composeId);
			}

			return null;
		}),
});
