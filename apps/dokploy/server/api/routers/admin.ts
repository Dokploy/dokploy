import {
	findUserById,
	IS_CLOUD,
	setupWebMonitoring,
	updateUser,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { apiUpdateWebServerMonitoring } from "@/server/db/schema";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const adminRouter = createTRPCRouter({
	setupMonitoring: adminProcedure
		.input(apiUpdateWebServerMonitoring)
		.mutation(async ({ input, ctx }) => {
			try {
				if (IS_CLOUD) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Feature disabled on cloud",
					});
				}
				const user = await findUserById(ctx.user.ownerId);
				if (user.id !== ctx.user.ownerId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup the monitoring",
					});
				}

				await updateUser(user.id, {
					metricsConfig: {
						server: {
							type: "Dokploy",
							refreshRate: input.metricsConfig.server.refreshRate,
							port: input.metricsConfig.server.port,
							token: input.metricsConfig.server.token,
							cronJob: input.metricsConfig.server.cronJob,
							urlCallback: input.metricsConfig.server.urlCallback,
							retentionDays: input.metricsConfig.server.retentionDays,
							thresholds: {
								cpu: input.metricsConfig.server.thresholds.cpu,
								memory: input.metricsConfig.server.thresholds.memory,
							},
						},
						containers: {
							refreshRate: input.metricsConfig.containers.refreshRate,
							services: {
								include: input.metricsConfig.containers.services.include || [],
								exclude: input.metricsConfig.containers.services.exclude || [],
							},
						},
					},
				});

				const currentServer = await setupWebMonitoring(user.id);
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
});
