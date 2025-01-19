import { slugify } from "@/lib/slug";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { generatePassword } from "@/templates/utils";
import { IS_CLOUD } from "@dokploy/server/constants";
import {
  apiCreateAi,
  apiUpdateAi,
  deploySuggestionSchema,
} from "@dokploy/server/db/schema/ai";
import {
  getAiSettingsByAdminId,
  getAiSettingById,
  saveAiSettings,
  deleteAiSettings,
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
  one: protectedProcedure
    .input(z.object({ aiId: z.string() }))
    .query(async ({ ctx, input }) => {
      const aiSetting = await getAiSettingById(input.aiId);
      if (aiSetting.adminId !== ctx.user.adminId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You don't have access to this AI configuration",
        });
      }
      return aiSetting;
    }),
  create: adminProcedure.input(apiCreateAi).mutation(async ({ ctx, input }) => {
    return await saveAiSettings(ctx.user.adminId, input);
  }),

  update: protectedProcedure
    .input(apiUpdateAi)
    .mutation(async ({ ctx, input }) => {
      return await saveAiSettings(ctx.user.adminId, input);
    }),

  getAll: adminProcedure.query(async ({ ctx }) => {
    return await getAiSettingsByAdminId(ctx.user.adminId);
  }),

  get: protectedProcedure
    .input(z.object({ aiId: z.string() }))
    .query(async ({ ctx, input }) => {
      const aiSetting = await getAiSettingById(input.aiId);
      if (aiSetting.adminId !== ctx.user.authId) {
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
      if (aiSetting.adminId !== ctx.user.adminId) {
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
        prompt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await suggestVariants(ctx.user.adminId, input.aiId, input.prompt);
    }),
  deploy: protectedProcedure
    .input(deploySuggestionSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.rol === "user") {
        await checkServiceAccess(ctx.user.adminId, input.projectId, "create");
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
