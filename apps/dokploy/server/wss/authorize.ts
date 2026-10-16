import { getAccessibleServerIds } from "@dokploy/server";
import {
	checkServiceAccess,
	findMemberByUserId,
	hasPermission,
	isLibreDBStudioApplication,
} from "@dokploy/server/services/permission";
import {
	resolveBoundTarget,
	type WssContainerTarget,
} from "./container-binding";

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
// Resolves to null when refused, or to the target docker must run on: for a
// service, the container or task ID inspected here.
const authorizeDockerOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId?: string | null,
	serviceId?: string | null,
	target?: WssContainerTarget,
): Promise<{ target: string | undefined } | null> => {
	if (!user || !session?.activeOrganizationId) return null;

	const ctx = buildCtx(user, session.activeOrganizationId);

	// When the container belongs to a specific Dokploy service (opened from a
	// service page, so serviceId is present), access to that service is the
	// authoritative gate — matching the service tRPC endpoints (e.g.
	// application.readLogs, which check service access only), as long as the
	// container, task or stats target belongs to that service. A member granted
	// the service can read its logs / open its terminal even without the broad
	// "docker" permission or explicit access to the server it runs on, except
	// the terminal of a LibreDB Studio, which only owners and admins open.
	if (serviceId) {
		try {
			await checkServiceAccess(ctx, serviceId, "read");
			// The handlers run docker on the caller's containerId, so access to a
			// service only covers the containers of that service.
			if (!target) return null;
			// The terminal prints the secrets a Studio holds in its env and seed.
			if (
				target.type === "terminal" &&
				(await isLibreDBStudioApplication(serviceId))
			) {
				const member = await findMemberByUserId(
					user.id,
					session.activeOrganizationId,
				);
				if (member.role !== "owner" && member.role !== "admin") return null;
			}
			const bound = await resolveBoundTarget(serviceId, serverId, target);
			return bound ? { target: bound } : null;
		} catch {
			return null;
		}
	}

	// Generic Docker overview (no service context): mirror the docker tRPC router
	// — require the docker permission and access to the target server.
	if (!(await hasPermission(ctx, { docker: ["read"] }))) return null;

	if (serverId && serverId !== "local") {
		const accessible = await getAccessibleServerIds({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});
		if (!accessible.has(serverId)) return null;
	}

	return {
		target: target && "containerId" in target ? target.containerId : undefined,
	};
};

export const canAccessDockerOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId?: string | null,
	serviceId?: string | null,
	target?: WssContainerTarget,
): Promise<boolean> =>
	(await authorizeDockerOverWss(user, session, serverId, serviceId, target)) !==
	null;

// The container or task ID a terminal or logs handler must run docker on, or
// null when the caller is refused.
export const resolveDockerContainerOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId: string | null,
	serviceId: string | null,
	target: Extract<WssContainerTarget, { containerId: string }>,
): Promise<string | null> =>
	(await authorizeDockerOverWss(user, session, serverId, serviceId, target))
		?.target ?? null;

// For a stats session bound by serviceId, the bound service's appName, which
// scopes the containers listed; null for a session opened with the docker
// permission; null in place of the object when the caller is refused.
export const resolveDockerStatsOverWss = async (
	user: WssUser,
	session: WssSession,
	serviceId: string | null,
	target: Extract<WssContainerTarget, { type: "stats" }>,
): Promise<{ serviceAppName: string | null } | null> => {
	const access = await authorizeDockerOverWss(
		user,
		session,
		null,
		serviceId,
		target,
	);
	if (!access) return null;
	return { serviceAppName: serviceId ? (access.target ?? null) : null };
};

// Authorizes the host/server SSH terminal opened over a WebSocket. The local
// host terminal is a root shell on the control-plane host, so it is restricted
// to owner/admin. A remote server terminal needs server access plus
// server.terminal.
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
		if (!accessible.has(serverId)) return false;

		return await hasPermission(buildCtx(user, session.activeOrganizationId), {
			server: ["terminal"],
		});
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
