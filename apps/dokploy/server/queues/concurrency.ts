import { db } from "@dokploy/server/db";
import { organization, server } from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { eq } from "drizzle-orm";
import { LOCAL_PARTITION } from "./in-memory-queue";

/**
 * Resolve the effective builds concurrency for a queue partition.
 *
 * Concurrent deployments (concurrency > 1) are an enterprise feature: without a
 * valid license the effective concurrency is always clamped to 1, so the
 * community experience is unchanged and an expired license degrades gracefully
 * back to sequential deployments instead of breaking anything.
 *
 * - `LOCAL_PARTITION` -> concurrency stored on the web server settings (the
 *   local Dokploy web server), gated by the owner organization's license.
 * - any other partition -> concurrency stored on the matching `server` row,
 *   gated by that server's organization license.
 */
export const resolveBuildsConcurrency = async (
	partition: string,
): Promise<number> => {
	try {
		if (partition === LOCAL_PARTITION) {
			return await resolveLocalConcurrency();
		}
		return await resolveServerConcurrency(partition);
	} catch (error) {
		console.error(
			"Failed to resolve builds concurrency, defaulting to 1",
			error,
		);
		return 1;
	}
};

const clamp = (value: number, licensed: boolean): number => {
	if (!licensed) return 1;
	return Math.min(20, Math.max(1, value));
};

const resolveLocalConcurrency = async (): Promise<number> => {
	const settings = await getWebServerSettings();
	const buildsConcurrency = settings?.buildsConcurrency ?? 1;

	// Self-hosted is single-tenant; gate on any organization's license.
	const anyOrg = await db.query.organization.findFirst({
		columns: { id: true },
	});
	const licensed = anyOrg ? await hasValidLicense(anyOrg.id) : false;

	return clamp(buildsConcurrency, licensed);
};

const resolveServerConcurrency = async (serverId: string): Promise<number> => {
	const currentServer = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
		columns: { buildsConcurrency: true, organizationId: true },
	});

	if (!currentServer) return 1;

	const licensed = await hasValidLicense(currentServer.organizationId);
	return clamp(currentServer.buildsConcurrency, licensed);
};
