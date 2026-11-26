import { randomBytes } from "node:crypto";
import {
	setupMonitoring,
	setupWebMonitoring,
} from "../../setup/monitoring-setup";
import { getDokployUrl } from "../admin";
import { findServerById, updateServerById } from "../server";
import {
	getWebServerSettings,
	updateWebServerSettings,
} from "../web-server-settings";

type MetricsConfig = NonNullable<
	Awaited<ReturnType<typeof getWebServerSettings>>
>["metricsConfig"];

/**
 * Turns on per-replica collection while keeping every value already set. Empty
 * values that would stop the agent from starting (no token, callback or
 * cleanup schedule) are filled in.
 */
export const withTaskMetricsEnabled = (
	config: MetricsConfig,
	defaults: { token: string; urlCallback: string },
): MetricsConfig => ({
	...config,
	server: {
		...config.server,
		port: config.server?.port || 4500,
		token: config.server?.token || defaults.token,
		urlCallback: config.server?.urlCallback || defaults.urlCallback,
		cronJob: config.server?.cronJob || "0 0 * * *",
		refreshRate: config.server?.refreshRate || 60,
		retentionDays: config.server?.retentionDays || 2,
	},
	tasks: {
		refreshRate: 15,
		retentionHours: 24,
		...config.tasks,
		enabled: true,
	},
});

export const installTaskMetricsAgent = async (application: {
	serverId: string | null;
}) => {
	const defaults = {
		token: randomBytes(32).toString("hex"),
		urlCallback: `${await getDokployUrl()}/api/trpc/notification.receiveNotification`,
	};

	if (application.serverId) {
		const server = await findServerById(application.serverId);
		await updateServerById(application.serverId, {
			metricsConfig: withTaskMetricsEnabled(server.metricsConfig, defaults),
		});
		await setupMonitoring(application.serverId);
		return;
	}

	const settings = await getWebServerSettings();
	if (!settings) throw new Error("Web server settings are missing");
	await updateWebServerSettings({
		metricsConfig: withTaskMetricsEnabled(settings.metricsConfig, defaults),
	});
	await setupWebMonitoring();
};
