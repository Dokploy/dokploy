import { db } from "@dokploy/server/db";
import { managedServer } from "@dokploy/server/db/schema/managed-server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type ManagedServer = typeof managedServer.$inferSelect;

export const createManagedServer = async (
	input: typeof managedServer.$inferInsert,
) => {
	const record = await db
		.insert(managedServer)
		.values(input)
		.returning()
		.then((r) => r[0]);
	if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return record;
};

export const findManagedServerById = async (managedServerId: string) => {
	const record = await db.query.managedServer.findFirst({
		where: eq(managedServer.managedServerId, managedServerId),
		with: { server: true },
	});
	if (!record)
		throw new TRPCError({ code: "NOT_FOUND", message: "Managed server not found" });
	return record;
};

export const findManagedServersByOrg = async (organizationId: string) => {
	return db.query.managedServer.findMany({
		where: eq(managedServer.organizationId, organizationId),
		with: { server: true },
		orderBy: (t, { desc }) => [desc(t.createdAt)],
	});
};

export const updateManagedServer = async (
	managedServerId: string,
	data: Partial<typeof managedServer.$inferInsert>,
) => {
	return db
		.update(managedServer)
		.set({ ...data, updatedAt: new Date().toISOString() })
		.where(eq(managedServer.managedServerId, managedServerId))
		.returning()
		.then((r) => r[0]);
};

export const deleteManagedServer = async (managedServerId: string) => {
	return db
		.delete(managedServer)
		.where(eq(managedServer.managedServerId, managedServerId));
};
