import { db } from "@dokploy/server/db";
import { server } from "@dokploy/server/db/schema";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { eq } from "drizzle-orm";

/**
 * Resolve the cgroup parent for `docker build --cgroup-parent` on the host
 * that runs the build: the web server settings for local builds, otherwise
 * the matching `server` row.
 */
export const resolveBuildCgroupParent = async (
	serverId: string | null | undefined,
): Promise<string | null> => {
	if (!serverId) {
		const settings = await getWebServerSettings();
		return settings?.buildCgroupParent || null;
	}
	const currentServer = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
		columns: { buildCgroupParent: true },
	});
	return currentServer?.buildCgroupParent || null;
};
