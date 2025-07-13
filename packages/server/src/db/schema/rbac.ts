import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { organization, member } from "./account";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PERMISSIONS = {
	PROJECT: {
		VIEW: {
			name: "project:view",
			description: "View projects",
		},
		CREATE: {
			name: "project:create",
			description: "Create projects",
		},
		DELETE: {
			name: "project:delete",
			description: "Delete projects",
		},
	},
	SERVICE: {
		VIEW: {
			name: "service:view",
			description: "View services",
		},
		CREATE: {
			name: "service:create",
			description: "Create services",
		},
		DELETE: {
			name: "service:delete",
			description: "Delete services",
		},
	},
	TRAEFIK: {
		ACCESS: {
			name: "traefik_files:access",
			description: "Access traefik files",
		},
	},
	DOCKER: {
		VIEW: {
			name: "docker:view",
			description: "View docker",
		},
	},
	API: {
		ACCESS: {
			name: "api:access",
			description: "Access API",
		},
	},
	SCHEDULES: {
		ACCESS: {
			name: "schedules:access",
			description: "Access schedules",
		},
	},
} as const;

export const ownerPermissions = [
	PERMISSIONS.PROJECT.VIEW,
	PERMISSIONS.PROJECT.CREATE,
	PERMISSIONS.PROJECT.DELETE,
	PERMISSIONS.SERVICE.VIEW,
	PERMISSIONS.SERVICE.CREATE,
	PERMISSIONS.SERVICE.DELETE,
	PERMISSIONS.TRAEFIK.ACCESS,
	PERMISSIONS.SCHEDULES.ACCESS,
] as const;

export const adminPermissions = [
	PERMISSIONS.PROJECT.VIEW,
	PERMISSIONS.PROJECT.CREATE,
	PERMISSIONS.PROJECT.DELETE,
	PERMISSIONS.SERVICE.VIEW,
	PERMISSIONS.SERVICE.CREATE,
	PERMISSIONS.SERVICE.DELETE,
	PERMISSIONS.TRAEFIK.ACCESS,
	PERMISSIONS.DOCKER.VIEW,
	PERMISSIONS.API.ACCESS,
	PERMISSIONS.SCHEDULES.ACCESS,
] as const;

export const memberPermissions = [
	PERMISSIONS.PROJECT.CREATE,
	PERMISSIONS.SERVICE.CREATE,
	PERMISSIONS.TRAEFIK.ACCESS,
] as const;

export const defaultPermissions = [
	{
		name: "owner",
		description: "Owner of the organization with full access to all features",
		permissions: ownerPermissions,
	},
	{
		name: "admin",
		description:
			"Administrator with access to manage projects, services and configurations",
		permissions: adminPermissions,
	},
	{
		name: "member",
		description:
			"Regular member with access to create projects and manage services",
		permissions: memberPermissions,
	},
] as const;

export const role = pgTable(
	"member_role",
	{
		roleId: text("roleId")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull().unique(),
		description: text("description"),
		canDelete: boolean("canDelete").notNull().default(true),
		isSystem: boolean("is_system").default(false),
		permissions: text("permissions").array(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
	},
	(table) => ({
		roleName: unique("role_name_unique").on(table.name, table.organizationId),
	}),
);

export const roleRelations = relations(role, ({ one, many }) => ({
	organization: one(organization, {
		fields: [role.organizationId],
		references: [organization.id],
	}),
	members: many(member),
}));

export type Role = typeof role.$inferSelect;

export const createRoleSchema = createInsertSchema(role)
	.omit({
		roleId: true,
		createdAt: true,
		updatedAt: true,
		isSystem: true,
		organizationId: true,
	})
	.extend({
		permissions: z.array(z.string()),
	});

export const updateRoleSchema = createRoleSchema.extend({
	roleId: z.string().min(1),
});

export const apiFindOneRole = z.object({
	roleId: z.string().min(1),
});
