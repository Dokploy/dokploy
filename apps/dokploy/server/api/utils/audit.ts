import type { AuditAction, AuditResourceType } from "@dokploy/server/db/schema";
import { createAuditLog } from "@dokploy/server/services/proprietary/audit-log";

interface AuditCtx {
	user: { id: string; email: string; role: string };
	session: { activeOrganizationId: string };
	auditRequestId?: string;
}

interface AuditEvent {
	action: AuditAction;
	resourceType: AuditResourceType;
	resourceId?: string;
	resourceName?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log entry from a tRPC context.
 * Extracts userId, userEmail, userRole and organizationId automatically.
 *
 * Usage:
 *   await audit(ctx, { action: "create", resourceType: "project", resourceName: "my-app" });
 */
export const audit = (ctx: AuditCtx, event: AuditEvent) =>
	createAuditLog({
		organizationId: ctx.session.activeOrganizationId,
		userId: ctx.user.id,
		userEmail: ctx.user.email,
		userRole: ctx.user.role,
		requestId: ctx.auditRequestId,
		...event,
	});

// Queries that return credentials, env vars, file contents or logs; every mutation is audited regardless.
export const SENSITIVE_QUERY_PATHS = new Set([
	"ai.one",
	"ai.getAll",
	"ai.getModels",
	"ai.getCustomProviders",
	"sshKey.one",
	"sshKey.all",
	"registry.one",
	"registry.all",
	"destination.one",
	"destination.all",
	"notification.one",
	"notification.all",
	"github.one",
	"gitlab.one",
	"gitea.one",
	"bitbucket.one",
	"dnsProvider.one",
	"vaultProvider.one",
	"vaultProvider.listSecretNames",
	"telemetryProvider.one",
	"certificates.one",
	"sso.one",
	"server.one",
	"server.withSSHKey",
	"application.one",
	"compose.one",
	"postgres.one",
	"mysql.one",
	"mariadb.one",
	"mongo.one",
	"redis.one",
	"libsql.one",
	"environment.one",
	"environment.byProjectId",
	"backup.one",
	"licenseKey.getEnterpriseSettings",
	"project.one",
	"docker.readContainerFile",
	"docker.getConfig",
	"dockerVolume.readVolumeFile",
	"mounts.readFileContent",
	"patch.readRepoFile",
	"sandbox.readFile",
	"application.readTraefikConfig",
	"application.readLogs",
	"compose.readLogs",
	"postgres.readLogs",
	"mysql.readLogs",
	"mariadb.readLogs",
	"mongo.readLogs",
	"redis.readLogs",
	"libsql.readLogs",
	"deployment.readLogs",
	"settings.readTraefikConfig",
	"settings.readWebServerTraefikConfig",
	"settings.readMiddlewareTraefikConfig",
	"settings.readTraefikFile",
	"settings.readTraefikEnv",
	"settings.readDirectories",
	"user.all",
	"user.one",
	"user.listSessions",
	"user.getUserByToken",
	"user.getMetricsToken",
	"organization.allInvitations",
	"auditLog.all",
	"auditLog.export",
	"cluster.addWorker",
	"cluster.addManager",
	"security.one",
	"mounts.one",
	"compose.getConvertedCompose",
	"schedule.one",
	"patch.one",
	"server.setupLog",
	"previewDeployment.one",
	"dockerImage.getImageConfig",
	"dockerVolume.getVolumeConfig",
]);

export const shouldAuditProcedure = (
	path: string,
	type: string,
	errorCode?: string,
) =>
	type !== "query" ||
	errorCode === "UNAUTHORIZED" ||
	errorCode === "FORBIDDEN" ||
	SENSITIVE_QUERY_PATHS.has(path);
