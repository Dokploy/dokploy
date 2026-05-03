import { eq } from "drizzle-orm";
import { db } from "../db";
import { type LocalServer, localServer } from "../db/schema/local-server";
import type { TunnelStatus } from "../db/schema/server";

export type { TunnelStatus };

export const findLocalServerByOrg = async (
	organizationId: string,
): Promise<LocalServer | null> => {
	const row = await db.query.localServer.findFirst({
		where: eq(localServer.organizationId, organizationId),
	});
	return row ?? null;
};

export const ensureLocalServer = async (
	organizationId: string,
): Promise<LocalServer> => {
	const inserted = await db
		.insert(localServer)
		.values({ organizationId })
		.onConflictDoNothing({ target: localServer.organizationId })
		.returning();
	if (inserted[0]) return inserted[0];
	const existing = await findLocalServerByOrg(organizationId);
	if (!existing) {
		throw new Error("Failed to create or fetch localServer row");
	}
	return existing;
};

export const setLocalTunnelState = async (
	organizationId: string,
	state: Partial<{
		tunnelStatus: TunnelStatus;
		tunnelId: string | null;
		tunnelToken: string | null;
		tunnelAccountId: string | null;
		tunnelError: string | null;
	}>,
): Promise<void> => {
	await db
		.update(localServer)
		.set({ ...state, tunnelCheckedAt: new Date().toISOString() })
		.where(eq(localServer.organizationId, organizationId));
};

export const clearLocalTunnel = async (
	organizationId: string,
): Promise<void> => {
	await db
		.update(localServer)
		.set({
			tunnelStatus: "disabled",
			tunnelId: null,
			tunnelToken: null,
			tunnelAccountId: null,
			tunnelError: null,
			tunnelCheckedAt: new Date().toISOString(),
		})
		.where(eq(localServer.organizationId, organizationId));
};
