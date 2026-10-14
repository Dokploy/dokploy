import { IS_CLOUD } from "@dokploy/server/constants";
import {
	findServerById,
	getAccessibleServerIds,
	type Server,
	setServerProviderIds,
} from "@dokploy/server/services/server";
import { setWebServerProviderIds } from "@dokploy/server/services/web-server-settings";
import {
	LOCAL_SERVER_NAME,
	reconcileVectorAgent,
	removeVectorAgent,
	withVectorTargetLock,
} from "@dokploy/server/setup/vector-setup";
import { TRPCError } from "@trpc/server";
import { assertProvidersBelongToOrg, type VectorTarget } from "./service";

const assertLocalAgentAllowed = (serverId: string | undefined) => {
	if (!serverId && IS_CLOUD) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"The Vector agent on the Dokploy host is not available in Dokploy Cloud",
		});
	}
};

const assertServerAccessible = async (
	serverId: string,
	session: { userId: string; activeOrganizationId: string },
) => {
	const server = await findServerById(serverId);
	const accessibleIds = await getAccessibleServerIds(session);
	if (
		server.organizationId !== session.activeOrganizationId ||
		!accessibleIds.has(serverId)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
	if (!server.sshKeyId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This server has no SSH key, so the Vector agent can't be managed on it",
		});
	}
	return server;
};

export const applyVectorAgentSelection = async (
	session: { userId: string; activeOrganizationId: string },
	serverId: string | undefined,
	providerIds: string[],
) => {
	const organizationId = session.activeOrganizationId;
	assertLocalAgentAllowed(serverId);
	const server = serverId
		? await assertServerAccessible(serverId, session)
		: undefined;
	if (providerIds.length > 0) {
		await assertProvidersBelongToOrg(providerIds, organizationId);
	}

	await withVectorTargetLock(serverId, async () => {
		if (serverId) {
			await setServerProviderIds(serverId, providerIds);
		} else if (!(await setWebServerProviderIds(organizationId, providerIds))) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "The local Vector agent is claimed by another organization",
			});
		}
		await reconcileVectorAgent(serverId);
	});
	return { serverName: server?.name ?? LOCAL_SERVER_NAME };
};

// Re-applies the saved selection after a provider changed; a failure is reported, not thrown.
export const reconcileVectorTargets = async (targets: VectorTarget[]) => {
	const failures: string[] = [];
	for (const target of targets) {
		if (target === null && IS_CLOUD) continue;
		try {
			await withVectorTargetLock(target ?? undefined, () =>
				reconcileVectorAgent(target ?? undefined),
			);
		} catch (error) {
			failures.push(
				`${target ?? LOCAL_SERVER_NAME}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return failures.length > 0
		? `The Vector agent could not be re-applied on ${failures.join("; ")}`
		: undefined;
};

// Even with an empty selection: Remove saves it before stopping the agent, so a failed Remove can leave one running.
export const removeServerVectorAgent = async (server: Server) => {
	if (!server.sshKeyId) {
		return server.telemetryProviderIds.length > 0
			? "This server has no SSH key, so the Vector agent could not be removed from it"
			: undefined;
	}
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
