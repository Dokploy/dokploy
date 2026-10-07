import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { organization } from "@dokploy/server/db/schema";
import { findServersWithLogManagementEnabled } from "@dokploy/server/services/server";
import {
	claimWebServerLogManagement,
	getWebServerSettings,
} from "@dokploy/server/services/web-server-settings";
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

	if (IS_CLOUD) return;
	const settings = await getWebServerSettings();
	if (settings?.logManagementOrganizationId !== organizationId) return;
	await removeVectorAgent().catch((error) => {
		console.error(
			`[Vector] Failed to remove the local agent before deleting organization ${organizationId}:`,
			error,
		);
	});
	await claimWebServerLogManagement(organizationId, []);
};

export const deleteOrganization = async (organizationId: string) => {
	await removeVectorAgents(organizationId);
	return await db
		.delete(organization)
		.where(eq(organization.id, organizationId));
};
