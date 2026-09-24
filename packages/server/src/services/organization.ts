import { db } from "@dokploy/server/db";
import { organization } from "@dokploy/server/db/schema";
import { findServersWithLogManagementEnabled } from "@dokploy/server/services/server";
import { removeVectorAgent } from "@dokploy/server/setup/vector-setup";
import { eq } from "drizzle-orm";

const removeVectorAgents = async (organizationId: string) => {
	const servers = await findServersWithLogManagementEnabled(organizationId);
	await Promise.all(
		servers.map((server) =>
			removeVectorAgent(server.serverId).catch((error) => {
				console.error(
					`[Vector] Failed to remove the agent on server ${server.serverId} before deleting organization ${organizationId}:`,
					error,
				);
			}),
		),
	);
};

export const deleteOrganization = async (organizationId: string) => {
	await removeVectorAgents(organizationId);
	return await db
		.delete(organization)
		.where(eq(organization.id, organizationId));
};
