import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { organization } from "@dokploy/server/db/schema";
import { findServersByOrganizationForVectorAgent } from "@dokploy/server/services/server";
import {
	getWebServerSettings,
	releaseWebServerAgent,
} from "@dokploy/server/services/web-server-settings";
import {
	removeVectorAgent,
	withVectorTargetLock,
} from "@dokploy/server/setup/vector-setup";
import { eq } from "drizzle-orm";

export const removeVectorAgents = async (organizationId: string) => {
	// Even with an empty selection: Remove saves it before stopping the agent, so a failed Remove can leave one running.
	const servers = await findServersByOrganizationForVectorAgent(organizationId);
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
		if (settings?.vectorAgentOrganizationId !== organizationId) return;
		await removeVectorAgent().catch((error) => {
			console.error(
				`[Vector] Failed to remove the local agent before deleting organization ${organizationId}:`,
				error,
			);
		});
		await releaseWebServerAgent(organizationId);
	});
};

export const deleteOrganization = async (organizationId: string) => {
	await removeVectorAgents(organizationId);
	return await db
		.delete(organization)
		.where(eq(organization.id, organizationId));
};
