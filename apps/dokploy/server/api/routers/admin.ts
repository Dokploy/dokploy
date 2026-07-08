import {
	getDokployUrl,
	getWebServerSettings,
	IS_CLOUD,
	redactWebServerSettings,
	resolveWebServerMetricsConfigUpdate,
	setupWebMonitoring,
	updateWebServerSettings,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { apiUpdateWebServerMonitoring } from "@/server/db/schema";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const adminRouter = createTRPCRouter({
	setupMonitoring: adminProcedure
		.input(apiUpdateWebServerMonitoring)
		.mutation(async ({ input }) => {
			try {
				if (IS_CLOUD) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Feature disabled on cloud",
					});
				}

				const currentSettings = await getWebServerSettings();
				const metricsConfig = resolveWebServerMetricsConfigUpdate(
					input.metricsConfig,
					currentSettings?.metricsConfig,
				);
				const urlCallback = `${await getDokployUrl()}/api/trpc/notification.receiveNotification`;

				await updateWebServerSettings({
					metricsConfig: {
						server: {
							type: "Dokploy",
							refreshRate: metricsConfig.server.refreshRate,
							port: metricsConfig.server.port,
							token: metricsConfig.server.token,
							cronJob: metricsConfig.server.cronJob,
							urlCallback,
							retentionDays: metricsConfig.server.retentionDays,
							thresholds: {
								cpu: metricsConfig.server.thresholds.cpu,
								memory: metricsConfig.server.thresholds.memory,
							},
						},
						containers: {
							refreshRate: metricsConfig.containers.refreshRate,
							services: {
								include: metricsConfig.containers.services.include || [],
								exclude: metricsConfig.containers.services.exclude || [],
							},
						},
					},
				});

				await setupWebMonitoring();
				const settings = await getWebServerSettings();
				return redactWebServerSettings(settings);
			} catch (error) {
				throw error;
			}
		}),
});
