import { db } from "@dokploy/server/db";
import { webServerSettings } from "@dokploy/server/db/schema";
import {
	isRedactedSecretValue,
	redactSecretValue,
} from "@dokploy/server/utils/security/redaction";
import { eq } from "drizzle-orm";

type WebServerSettings = typeof webServerSettings.$inferSelect;
type WebServerMetricsConfig = WebServerSettings["metricsConfig"];
type WebServerMetricsConfigUpdate = {
	server: Omit<WebServerMetricsConfig["server"], "type"> & {
		type?: WebServerMetricsConfig["server"]["type"];
	};
	containers: Omit<WebServerMetricsConfig["containers"], "services"> & {
		services: {
			include?: string[];
			exclude?: string[];
		};
	};
};

export const redactWebServerSettings = <
	T extends WebServerSettings | null | undefined,
>(
	settings: T,
): T => {
	if (!settings) {
		return settings;
	}

	return {
		...settings,
		sshPrivateKey: redactSecretValue(settings.sshPrivateKey),
		metricsConfig: settings.metricsConfig
			? {
					...settings.metricsConfig,
					server: {
						...settings.metricsConfig.server,
						token: redactSecretValue(settings.metricsConfig.server.token),
					},
				}
			: settings.metricsConfig,
	} as T;
};

export const resolveWebServerMetricsConfigUpdate = <
	T extends WebServerMetricsConfigUpdate,
>(
	metricsConfig: T,
	currentMetricsConfig: WebServerMetricsConfig | null | undefined,
) => ({
	...metricsConfig,
	server: {
		...metricsConfig.server,
		token: isRedactedSecretValue(metricsConfig.server.token)
			? (currentMetricsConfig?.server?.token ?? "")
			: metricsConfig.server.token,
	},
});

/**
 * Get the web server settings (singleton - only one row should exist)
 */
export const getWebServerSettings = async () => {
	const settings = await db.query.webServerSettings.findFirst({
		orderBy: (settings, { asc }) => [asc(settings.createdAt)],
	});

	if (!settings) {
		// Create default settings if none exist
		const [newSettings] = await db
			.insert(webServerSettings)
			.values({})
			.returning();

		return newSettings;
	}

	return settings;
};

/**
 * Update web server settings
 */
export const updateWebServerSettings = async (
	updates: Partial<typeof webServerSettings.$inferInsert>,
) => {
	const current = await getWebServerSettings();

	const [updated] = await db
		.update(webServerSettings)
		.set({
			...updates,
			updatedAt: new Date(),
		})
		.where(eq(webServerSettings.id, current?.id ?? ""))
		.returning();

	return updated;
};
