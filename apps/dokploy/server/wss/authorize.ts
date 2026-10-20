import { getAccessibleServerIds } from "@dokploy/server";
import { db } from "@dokploy/server/db";
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
	// return false;
	if (!user || !session?.activeOrganizationId) return false;

	const ctx = buildCtx(user, session.activeOrganizationId);

	// When the container belongs to a specific Dokploy service (opened from a
	// service page, so serviceId is present), access to that service is the
	// authoritative gate — matching the service tRPC endpoints (e.g.
	// application.readLogs, which check service access only). A member granted
	// the service can read its logs / open its terminal even without the broad
	// "docker" permission or explicit access to the server it runs on.
	if (serviceId) {
		try {
			await checkServiceAccess(ctx, serviceId, "read");
			return true;
		} catch {
			return false;
		}
	}

	// Generic Docker overview (no service context): mirror the docker tRPC router
	// — require the docker permission and access to the target server.
	if (!(await hasPermission(ctx, { docker: ["read"] }))) return false;

	if (serverId && serverId !== "local") {
		const accessible = await getAccessibleServerIds({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});
		if (!accessible.has(serverId)) return false;
	}

	return true;
};

// Returns the appName of the service with this id, whichever service type it
// is. Service-scoped sockets use it to check that the requested container
// belongs to the service the caller was authorized for.
export const findServiceAppName = async (
	serviceId: string,
): Promise<string | null> => {
	const columns = { appName: true } as const;
	const results = await Promise.all([
		db.query.applications.findFirst({
			columns,
			where: (t, { eq }) => eq(t.applicationId, serviceId),
		}),
		db.query.compose.findFirst({
			columns,
			where: (t, { eq }) => eq(t.composeId, serviceId),
		}),
		db.query.postgres.findFirst({
			columns,
			where: (t, { eq }) => eq(t.postgresId, serviceId),
		}),
		db.query.mysql.findFirst({
			columns,
			where: (t, { eq }) => eq(t.mysqlId, serviceId),
		}),
		db.query.mariadb.findFirst({
			columns,
			where: (t, { eq }) => eq(t.mariadbId, serviceId),
		}),
		db.query.mongo.findFirst({
			columns,
			where: (t, { eq }) => eq(t.mongoId, serviceId),
		}),
		db.query.redis.findFirst({
			columns,
			where: (t, { eq }) => eq(t.redisId, serviceId),
		}),
		db.query.libsql.findFirst({
			columns,
			where: (t, { eq }) => eq(t.libsqlId, serviceId),
		}),
	]);
	return results.find(Boolean)?.appName ?? null;
};

// Whether a stats request for `appName` targets the service named
// `serviceAppName`. Applications and databases run as one swarm service named
// after the app; stack tasks are namespaced "<stack>_<service>". Compose
// container names are free-form, so the stats socket also filters compose and
// stack containers by their project/namespace label.
export const isServiceContainerName = (
	appName: string,
	appType: "application" | "stack" | "docker-compose",
	serviceAppName: string,
): boolean => {
	if (appType === "application") return appName === serviceAppName;
	if (appType === "stack") return appName.startsWith(`${serviceAppName}_`);
	return true;
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
