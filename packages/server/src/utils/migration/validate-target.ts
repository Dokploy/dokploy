import { TRPCError } from "@trpc/server";

/**
 * Minimal shape of a target server record needed to decide whether it's a
 * valid destination for a cross-server service move. Kept narrow and
 * dependency-free so this logic can be unit tested without touching the
 * database.
 */
export interface MoveTargetServerInfo {
	organizationId: string;
	serverStatus: "active" | "inactive";
	serverType: "deploy" | "build";
	sshKeyId: string | null;
}

/**
 * Mirrors the validation used by the existing application "move to server"
 * feature: the target must belong to the caller's organization, be an
 * active deployment server, and have an SSH key configured.
 */
export const assertValidRemoteMoveTarget = (
	target: MoveTargetServerInfo,
	activeOrganizationId: string,
): void => {
	if (
		target.organizationId !== activeOrganizationId ||
		target.serverStatus !== "active" ||
		target.serverType !== "deploy" ||
		!target.sshKeyId
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"The target server must be an active deployment server with an SSH key",
		});
	}
};

/**
 * The local Dokploy server is only a valid move target for self-hosted
 * instances that haven't been locked to "remote servers only".
 */
export const assertLocalMoveTargetAllowed = ({
	isCloud,
	remoteServersOnly,
}: {
	isCloud: boolean;
	remoteServersOnly: boolean;
}): void => {
	if (isCloud || remoteServersOnly) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The local Dokploy server is not available",
		});
	}
};

/** A move to the service's current server is a no-op and should be rejected. */
export const assertDifferentMoveTarget = (
	sourceServerId: string | null,
	targetServerId: string | null,
): void => {
	if (sourceServerId === targetServerId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The service is already assigned to this server",
		});
	}
};
