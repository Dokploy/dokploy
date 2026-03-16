import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { organization } from "./account";
import { user } from "./user";

export const auditLog = pgTable(
	"audit_log",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organization_id")
			.references(() => organization.id, { onDelete: "set null" }),
		userId: text("user_id")
			.references(() => user.id, { onDelete: "set null" }),
		userEmail: text("user_email").notNull(),
		userRole: text("user_role").notNull(),
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),
		resourceName: text("resource_name"),
		metadata: text("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		orgIdx: index("auditLog_organizationId_idx").on(t.organizationId),
		userIdx: index("auditLog_userId_idx").on(t.userId),
		createdAtIdx: index("auditLog_createdAt_idx").on(t.createdAt),
	}),
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
	organization: one(organization, {
		fields: [auditLog.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [auditLog.userId],
		references: [user.id],
	}),
}));

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

export type AuditAction =
	| "create"
	| "update"
	| "delete"
	| "deploy"
	| "cancel"
	| "redeploy"
	| "login"
	| "logout"
	| "restore"
	| "run"
	| "start"
	| "stop"
	| "reload"
	| "rebuild"
	| "move";

export type AuditResourceType =
	| "project"
	| "service"
	| "environment"
	| "deployment"
	| "user"
	| "customRole"
	| "domain"
	| "certificate"
	| "registry"
	| "server"
	| "sshKey"
	| "gitProvider"
	| "destination"
	| "notification"
	| "settings"
	| "session"
	| "port"
	| "redirect"
	| "security"
	| "schedule"
	| "backup"
	| "volumeBackup"
	| "docker"
	| "swarm"
	| "previewDeployment"
	| "organization"
	| "cluster"
	| "mount"
	| "application"
	| "compose";
