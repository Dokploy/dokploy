import { IS_CLOUD } from "@dokploy/server/constants";
import {
	type Server,
	updateServerLogProviders,
} from "@dokploy/server/services/server";
import { claimWebServerLogManagement } from "@dokploy/server/services/web-server-settings";
import {
	removeVectorAgent,
	setupVectorAgent,
} from "@dokploy/server/setup/vector-setup";
import { TRPCError } from "@trpc/server";
import {
	assertLogProvidersBelongToOrg,
	assertServerBelongsToOrg,
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

export const deployLogManagement = async (
	organizationId: string,
	serverId: string | undefined,
	logProviderIds: string[],
) => {
	assertLocalAgentAllowed(serverId);
	await assertServerBelongsToOrg(serverId, organizationId);
	await assertLogProvidersBelongToOrg(logProviderIds, organizationId);

	if (serverId) {
		await updateServerLogProviders(serverId, logProviderIds);
	} else {
		const claimed = await claimWebServerLogManagement(
			organizationId,
			logProviderIds,
		);
		if (!claimed) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"The local Vector agent is already claimed by another organization",
			});
		}
	}

	await setupVectorAgent(organizationId, serverId, logProviderIds);
};

export const removeLogManagement = async (
	organizationId: string,
	serverId: string | undefined,
) => {
	assertLocalAgentAllowed(serverId);

	if (serverId) {
		await assertServerBelongsToOrg(serverId, organizationId);
		await removeVectorAgent(serverId);
		await updateServerLogProviders(serverId, []);
		return;
	}

	const released = await claimWebServerLogManagement(organizationId, []);
	if (!released) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "The local Vector agent is claimed by another organization",
		});
	}
	await removeVectorAgent();
};

export const removeServerLogManagement = async (server: Server) => {
	if (!server.logProviderIds?.length) return;
	try {
		await removeVectorAgent(server.serverId);
	} catch (error) {
		console.error(
			`[Vector] Failed to remove agent for server ${server.serverId} before deletion:`,
			error,
		);
		return error instanceof Error ? error.message : String(error);
	}
};
