import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { organization } from "@dokploy/server/db/schema";
import { findServersByOrganizationForLogManagement } from "@dokploy/server/services/server";
import {
	getWebServerSettings,
	releaseWebServerLogManagement,
} from "@dokploy/server/services/web-server-settings";
import {
	removeVectorAgent,
	withVectorTargetLock,
} from "@dokploy/server/setup/vector-setup";
import { eq } from "drizzle-orm";

const removeVectorAgents = async (organizationId: string) => {
	// Every server, not only those with providers: deleting the last provider leaves the agent deployed.
	const servers =
		await findServersByOrganizationForLogManagement(organizationId);
	await Promise.all(
		servers.map((server) =>
			withVectorTargetLock(server.serverId, () =>
				removeVectorAgent(server.serverId),
			).catch((error) => {
				console.error(
					`[Vector] Failed to remove the agent on server ${server.serverId} before deleting organization ${organizationId}:`,
					error,
				);
			}),
		),
	);

	if (IS_CLOUD) return;
	await withVectorTargetLock(undefined, async () => {
		const settings = await getWebServerSettings();
		if (settings?.logManagementOrganizationId !== organizationId) return;
		await removeVectorAgent().catch((error) => {
			console.error(
				`[Vector] Failed to remove the local agent before deleting organization ${organizationId}:`,
				error,
			);
		});
		await releaseWebServerLogManagement(organizationId);
	});
};

export const deleteOrganization = async (organizationId: string) => {
	await removeVectorAgents(organizationId);
	return await db
		.delete(organization)
		.where(eq(organization.id, organizationId));
};
