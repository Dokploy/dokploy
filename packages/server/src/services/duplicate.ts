import type { DuplicateTargetServer } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { IS_CLOUD } from "../constants";
import { resolveNetworkIds } from "./network";
import { findServerById, getAccessibleServerIds } from "./server";
import { getWebServerSettings } from "./web-server-settings";

export const assertDuplicateTargetServer = async (
	session: { userId: string; activeOrganizationId: string },
	target: DuplicateTargetServer,
): Promise<void> => {
	if (target.kind === "keep") {
		return;
	}

	if (target.kind === "dokploy") {
		if (IS_CLOUD || (await getWebServerSettings())?.remoteServersOnly) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The Dokploy server is not available as a target",
			});
		}
		return;
	}

	const accessibleIds = await getAccessibleServerIds(session);
	if (!accessibleIds.has(target.serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}

	const server = await findServerById(target.serverId);
	if (server.serverStatus !== "active" || server.serverType !== "deploy") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The target server is not available for deployments",
		});
	}
};

export const duplicateServerOverride = async (
	target: DuplicateTargetServer,
	source: { serverId?: string | null; networkIds?: string[] | null },
): Promise<{ serverId?: string | null; networkIds?: string[] }> => {
	if (target.kind === "keep") {
		return {};
	}

	const serverId = target.kind === "dokploy" ? null : target.serverId;
	if (serverId === (source.serverId ?? null)) {
		return { serverId };
	}
	if (!Array.isArray(source.networkIds) || source.networkIds.length === 0) {
		return { serverId };
	}

	return {
		serverId,
		networkIds: (await resolveNetworkIds(source.networkIds, serverId)).kept,
	};
};
