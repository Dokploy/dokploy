import { IS_CLOUD } from "@dokploy/server/constants";
import {
	getAccessibleServerIds,
	type Server,
	updateServerLogProviders,
} from "@dokploy/server/services/server";
import {
	claimWebServerLogManagement,
	getWebServerSettings,
	releaseWebServerLogManagement,
} from "@dokploy/server/services/web-server-settings";
import {
	removeVectorAgent,
	setupVectorAgent,
	withVectorTargetLock,
} from "@dokploy/server/setup/vector-setup";
import { TRPCError } from "@trpc/server";
import {
	assertLogProvidersBelongToOrg,
	assertServerBelongsToOrg,
	filterExistingLogProviderIds,
} from "./service";

const assertLocalAgentAllowed = (serverId: string | undefined) => {
	if (!serverId && IS_CLOUD) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Log management on the Dokploy host is not available in Dokploy Cloud",
		});
	}
};

const assertServerAccessible = async (
	serverId: string,
	session: { userId: string; activeOrganizationId: string },
) => {
	await assertServerBelongsToOrg(serverId, session.activeOrganizationId);
	const accessibleIds = await getAccessibleServerIds(session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

export const deployLogManagement = async (
	session: { userId: string; activeOrganizationId: string },
	serverId: string | undefined,
	logProviderIds: string[],
) => {
	const organizationId = session.activeOrganizationId;
	assertLocalAgentAllowed(serverId);
	if (serverId) {
		await assertServerAccessible(serverId, session);
	}
	await assertLogProvidersBelongToOrg(logProviderIds, organizationId);

	await withVectorTargetLock(serverId, async () => {
		if (serverId) {
			await setupVectorAgent(organizationId, serverId, logProviderIds);
			// A provider deleted during the deploy must not be written back.
			await updateServerLogProviders(
				serverId,
				await filterExistingLogProviderIds(logProviderIds),
			);
			return;
		}

		const settings = await getWebServerSettings();
		const previousOwner = settings?.logManagementOrganizationId ?? null;
		const previousIds = settings?.logProviderIds ?? [];
		const claimed = await claimWebServerLogManagement(
			organizationId,
			previousOwner ? previousIds : [],
		);
		if (!claimed) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"The local Vector agent is already claimed by another organization",
			});
		}

		try {
			await setupVectorAgent(organizationId, undefined, logProviderIds);
		} catch (error) {
			if (!previousOwner) {
				await releaseWebServerLogManagement(organizationId);
			}
			throw error;
		}
		await claimWebServerLogManagement(
			organizationId,
			await filterExistingLogProviderIds(logProviderIds),
		);
	});
};

export const removeLogManagement = async (
	session: { userId: string; activeOrganizationId: string },
	serverId: string | undefined,
) => {
	const organizationId = session.activeOrganizationId;
	assertLocalAgentAllowed(serverId);

	if (serverId) {
		await assertServerAccessible(serverId, session);
		await withVectorTargetLock(serverId, async () => {
			await removeVectorAgent(serverId);
			await updateServerLogProviders(serverId, []);
		});
		return;
	}

	await withVectorTargetLock(undefined, async () => {
		const settings = await getWebServerSettings();
		const owner = settings?.logManagementOrganizationId;
		if (owner && owner !== organizationId) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "The local Vector agent is claimed by another organization",
			});
		}
		await removeVectorAgent();
		await releaseWebServerLogManagement(organizationId);
	});
};

// Runs even with no providers assigned: deleting the last provider leaves the agent deployed.
export const removeServerLogManagement = async (server: Server) => {
	if (!server.sshKeyId) return;
	try {
		await withVectorTargetLock(server.serverId, () =>
			removeVectorAgent(server.serverId),
		);
	} catch (error) {
		console.error(
			`[Vector] Failed to remove agent for server ${server.serverId} before deletion:`,
			error,
		);
		return error instanceof Error ? error.message : String(error);
	}
};
