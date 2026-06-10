import { db } from "@dokploy/server/db";
import { server, webServerSettings } from "@dokploy/server/db/schema";
import { assertValidCaddyTrustedProxyConfig } from "@dokploy/server/utils/caddy/config";
import type {
	CaddyAccessLogConfig,
	CaddyTrustedProxyConfig,
	CaddyTrustedProxySettings,
} from "@dokploy/server/utils/caddy/types";
import {
	normalizeWebServerProvider,
	type WebServerProvider,
} from "@dokploy/server/utils/web-server/providers";
import { eq } from "drizzle-orm";

const normalizeStringList = (values: string[] | null | undefined) =>
	Array.from(
		new Set(
			(values ?? [])
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		),
	);

export const normalizeCaddyTrustedProxySettings = (
	settings: CaddyTrustedProxySettings | null | undefined,
): CaddyTrustedProxySettings | null => {
	if (!settings || settings.mode === "disabled") {
		return null;
	}

	const normalized: CaddyTrustedProxySettings =
		settings.mode === "cloudflare"
			? {
					mode: "cloudflare",
					clientIpHeaders: normalizeStringList(settings.clientIpHeaders),
					strict: settings.strict !== false,
				}
			: {
					mode: "static",
					ranges: normalizeStringList(settings.ranges),
					clientIpHeaders: normalizeStringList(settings.clientIpHeaders),
					strict: settings.strict !== false,
				};

	assertValidCaddyTrustedProxyConfig(
		caddyTrustedProxySettingsToConfig(normalized),
	);

	return normalized;
};

export const caddyTrustedProxySettingsToConfig = (
	settings: CaddyTrustedProxySettings | null | undefined,
): CaddyTrustedProxyConfig | null => {
	if (!settings || settings.mode === "disabled") {
		return null;
	}

	if (settings.mode === "cloudflare") {
		return {
			source: "cloudflare",
			clientIpHeaders: settings.clientIpHeaders?.length
				? settings.clientIpHeaders
				: undefined,
			strict: settings.strict,
		};
	}

	return {
		source: "static",
		ranges: settings.ranges ?? [],
		clientIpHeaders: settings.clientIpHeaders?.length
			? settings.clientIpHeaders
			: undefined,
		strict: settings.strict,
	};
};

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

export const getLocalWebServerProvider =
	async (): Promise<WebServerProvider> => {
		const settings = await getWebServerSettings();
		return normalizeWebServerProvider(settings?.webServerProvider);
	};

export const updateLocalWebServerProvider = async (
	provider: WebServerProvider,
) => {
	return updateWebServerSettings({ webServerProvider: provider });
};

export const getRemoteWebServerProvider = async (
	serverId: string,
): Promise<WebServerProvider> => {
	const remoteServer = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
		columns: {
			webServerProvider: true,
		},
	});

	if (!remoteServer) {
		throw new Error(`Server not found: ${serverId}`);
	}

	return normalizeWebServerProvider(remoteServer.webServerProvider);
};

export const updateRemoteWebServerProvider = async (
	serverId: string,
	provider: WebServerProvider,
) => {
	const [updated] = await db
		.update(server)
		.set({ webServerProvider: provider })
		.where(eq(server.serverId, serverId))
		.returning();

	return updated;
};

export const getCaddyTrustedProxySettings = async (
	serverId?: string | null,
): Promise<CaddyTrustedProxySettings | null> => {
	if (serverId) {
		const remoteServer = await db.query.server.findFirst({
			where: eq(server.serverId, serverId),
			columns: {
				caddyTrustedProxyConfig: true,
			},
		});

		if (!remoteServer) {
			throw new Error(`Server not found: ${serverId}`);
		}

		return normalizeCaddyTrustedProxySettings(
			remoteServer.caddyTrustedProxyConfig,
		);
	}

	const settings = await getWebServerSettings();
	return normalizeCaddyTrustedProxySettings(settings?.caddyTrustedProxyConfig);
};

export const getCaddyTrustedProxyConfig = async (
	serverId?: string | null,
): Promise<CaddyTrustedProxyConfig | null> => {
	return caddyTrustedProxySettingsToConfig(
		await getCaddyTrustedProxySettings(serverId),
	);
};

export const getCaddyCompileSettings = async (
	serverId?: string | null,
): Promise<{
	letsEncryptEmail?: string | null;
	trustedProxies?: CaddyTrustedProxyConfig | null;
	accessLogs?: CaddyAccessLogConfig | null;
}> => {
	if (serverId) {
		return {
			trustedProxies: await getCaddyTrustedProxyConfig(serverId),
		};
	}

	const settings = await getWebServerSettings();
	return localWebServerSettingsToCaddyCompileSettings(settings);
};

export const localWebServerSettingsToCaddyCompileSettings = (
	settings: typeof webServerSettings.$inferSelect | null | undefined,
): {
	letsEncryptEmail?: string | null;
	trustedProxies?: CaddyTrustedProxyConfig | null;
	accessLogs?: CaddyAccessLogConfig | null;
} => {
	return {
		letsEncryptEmail: settings?.letsEncryptEmail,
		trustedProxies: caddyTrustedProxySettingsToConfig(
			normalizeCaddyTrustedProxySettings(settings?.caddyTrustedProxyConfig),
		),
		accessLogs: settings?.requestLogsEnabled ? { enabled: true } : null,
	};
};

export const updateCaddyTrustedProxySettings = async (
	settings: CaddyTrustedProxySettings | null,
	serverId?: string | null,
) => {
	const normalized = normalizeCaddyTrustedProxySettings(settings);
	if (serverId) {
		const [updated] = await db
			.update(server)
			.set({ caddyTrustedProxyConfig: normalized })
			.where(eq(server.serverId, serverId))
			.returning();

		return updated;
	}

	return updateWebServerSettings({ caddyTrustedProxyConfig: normalized });
};

export const resolveWebServerProvider = async (
	serverId?: string | null,
): Promise<WebServerProvider> => {
	if (serverId) {
		return getRemoteWebServerProvider(serverId);
	}

	return getLocalWebServerProvider();
};
