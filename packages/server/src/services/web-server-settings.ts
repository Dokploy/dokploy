import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { server, webServerSettings } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type WebServerProvider =
	typeof webServerSettings.$inferSelect.webServerProvider;

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
 * Get the proxy that serves a server's domains: the remote server's own, or
 * the Dokploy host's when no server is given. Always Traefik on Dokploy Cloud
 */
export const getWebServerProvider = async (
	serverId?: string | null,
): Promise<WebServerProvider> => {
	if (IS_CLOUD) return "traefik";

	if (!serverId) {
		return (await getWebServerSettings())?.webServerProvider ?? "traefik";
	}

	const remote = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
		columns: { webServerProvider: true },
	});

	return remote?.webServerProvider ?? "traefik";
};

/**
 * Refuse a Traefik-only change on a server that runs Caddy, where it would
 * be saved and have no effect
 */
export const assertTraefikProvider = async (serverId?: string | null) => {
	if ((await getWebServerProvider(serverId)) === "caddy") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This server runs Caddy, so Traefik's configuration is not in use",
		});
	}
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
