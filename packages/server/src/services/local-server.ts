import { eq } from "drizzle-orm";
import { db } from "../db";
import { type LocalServer, localServer } from "../db/schema/local-server";

export type TunnelStatus =
	| "disabled"
	| "provisioning"
	| "installing"
	| "registering"
	| "healthy"
	| "error";

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
	const existing = await findLocalServerByOrg(organizationId);
	if (existing) return existing;
	const inserted = await db
		.insert(localServer)
		.values({ organizationId })
		.returning();
	if (!inserted[0]) {
		throw new Error("Failed to create localServer row");
	}
	return inserted[0];
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
