import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
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
} as const;

const getAllPermissionNames = () => {
	return Object.values(PERMISSIONS).flatMap((category) =>
		Object.values(category).map((permission) => permission.name),
	);
};

export const ownerPermissions = getAllPermissionNames();

export const adminPermissions = [
	PERMISSIONS.PROJECT.VIEW.name,
	PERMISSIONS.PROJECT.CREATE.name,
	PERMISSIONS.PROJECT.DELETE.name,
	PERMISSIONS.SERVICE.VIEW.name,
	PERMISSIONS.SERVICE.CREATE.name,
	PERMISSIONS.SERVICE.DELETE.name,
	PERMISSIONS.TRAEFIK.ACCESS.name,
	PERMISSIONS.DOCKER.VIEW.name,
	PERMISSIONS.API.ACCESS.name,
];

export const memberPermissions = [
	PERMISSIONS.PROJECT.CREATE.name,
	PERMISSIONS.SERVICE.CREATE.name,
	PERMISSIONS.TRAEFIK.ACCESS.name,
];

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

export const role = pgTable("organization_role", {
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
});

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
