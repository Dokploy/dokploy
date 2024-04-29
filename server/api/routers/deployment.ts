import { apiFindAllByApplication } from "@/server/db/schema";
import { findAllDeploymentsByApplicationId } from "../services/deployment";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const deploymentRouter = createTRPCRouter({
  all: protectedProcedure
    .input(apiFindAllByApplication)
    .query(async ({ input }) => {
      return await findAllDeploymentsByApplicationId(input.applicationId);
    }),
});
