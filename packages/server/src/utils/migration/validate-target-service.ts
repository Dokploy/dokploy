import {
	findServerById,
	getAccessibleServerIds,
} from "@dokploy/server/services/server";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { TRPCError } from "@trpc/server";
import { IS_CLOUD } from "../../constants";
import {
	assertDifferentMoveTarget,
	assertLocalMoveTargetAllowed,
	assertValidRemoteMoveTarget,
} from "./validate-target";

/**
 * Full server-side validation for a "move to another server" request,
 * shared by Compose and every database service type (instead of
 * duplicating the same checks in each router). Mirrors the checks already
 * enforced for application moves: the target must be an accessible, active
 * deployment server with an SSH key, the local Dokploy server is only
 * offered when self-hosted and not locked to remote-servers-only, and a
 * move to the current server is rejected.
 */
export const validateMoveTarget = async ({
	session,
	sourceServerId,
	targetServerId,
}: {
	session: { userId: string; activeOrganizationId: string };
	sourceServerId: string | null;
	targetServerId: string | null;
}): Promise<void> => {
	assertDifferentMoveTarget(sourceServerId, targetServerId);

	if (targetServerId) {
		const accessibleIds = await getAccessibleServerIds(session);
		if (!accessibleIds.has(targetServerId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access the target server",
			});
		}

		const targetServer = await findServerById(targetServerId);
		assertValidRemoteMoveTarget(targetServer, session.activeOrganizationId);
	} else {
		const webServerSettings = await getWebServerSettings();
		assertLocalMoveTargetAllowed({
			isCloud: IS_CLOUD,
			remoteServersOnly: Boolean(webServerSettings?.remoteServersOnly),
		});
	}
};
