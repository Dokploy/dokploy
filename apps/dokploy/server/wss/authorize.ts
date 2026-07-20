import { getAccessibleServerIds } from "@dokploy/server";
import {
	checkServiceAccess,
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";

type WssUser = { id: string } | null | undefined;
type WssSession = { activeOrganizationId?: string | null } | null | undefined;

const buildCtx = (user: { id: string }, activeOrganizationId: string) => ({
	user: { id: user.id },
	session: { activeOrganizationId },
});

// Authorizes docker/container operations opened over a WebSocket (container
// terminal, container logs, container stats). Requires the docker permission
// (owner/admin, or a member explicitly granted canAccessToDocker) and, for a
// remote server, that the server is accessible to the caller. Previously these
// handlers only checked session + organization, so any member could reach a
// root shell / logs of any container.
export const canAccessDockerOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId?: string | null,
	serviceId?: string | null,
): Promise<boolean> => {
	if (!user || !session?.activeOrganizationId) return false;

	const ctx = buildCtx(user, session.activeOrganizationId);
	if (!(await hasPermission(ctx, { docker: ["read"] }))) return false;

	if (serverId && serverId !== "local") {
		const accessible = await getAccessibleServerIds({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});
		if (!accessible.has(serverId)) return false;
	}

	// When the container belongs to a known Dokploy service (opened from a
	// service page), enforce service-level access too. Container terminals
	// opened from the generic Docker overview have no serviceId and fall back to
	// the docker-permission + server checks above.
	if (serviceId) {
		try {
			await checkServiceAccess(ctx, serviceId, "read");
		} catch {
			return false;
		}
	}

	return true;
};

// Authorizes the host/server SSH terminal opened over a WebSocket. The local
// host terminal is a root shell on the control-plane host, so it is restricted
// to owner/admin. A remote server terminal is gated on server access.
export const canAccessTerminalOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId?: string | null,
): Promise<boolean> => {
	if (!user || !session?.activeOrganizationId) return false;

	if (serverId && serverId !== "local") {
		const accessible = await getAccessibleServerIds({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});
		return accessible.has(serverId);
	}

	try {
		const member = await findMemberByUserId(
			user.id,
			session.activeOrganizationId,
		);
		return member?.role === "owner" || member?.role === "admin";
	} catch {
		return false;
	}
};
