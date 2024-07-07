import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { relations, sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { auth } from "./auth";
import { admins } from "./admin";
import { z } from "zod";
/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */

export const users = pgTable("user", {
	userId: text("userId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	token: text("token").notNull(),
	isRegistered: boolean("isRegistered").notNull().default(false),
	expirationDate: timestamp("expirationDate", {
		precision: 3,
		mode: "string",
	}).notNull(),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	canCreateProjects: boolean("canCreateProjects").notNull().default(false),
	canCreateServices: boolean("canCreateServices").notNull().default(false),
	canDeleteProjects: boolean("canDeleteProjects").notNull().default(false),
	canDeleteServices: boolean("canDeleteServices").notNull().default(false),
	canAccessToDocker: boolean("canAccessToDocker").notNull().default(false),
	canAccessToAPI: boolean("canAccessToAPI").notNull().default(false),
	canAccessToTraefikFiles: boolean("canAccessToTraefikFiles")
		.notNull()
		.default(false),
	accesedProjects: text("accesedProjects")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	accesedServices: text("accesedServices")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
	authId: text("authId")
		.notNull()
		.references(() => auth.id, { onDelete: "cascade" }),
});

export const usersRelations = relations(users, ({ one }) => ({
	auth: one(auth, {
		fields: [users.authId],
		references: [auth.id],
	}),
	admin: one(admins, {
		fields: [users.adminId],
		references: [admins.adminId],
	}),
}));

const createSchema = createInsertSchema(users, {
	userId: z.string().min(1),
	authId: z.string().min(1),
	token: z.string().min(1),
	isRegistered: z.boolean().optional(),
	adminId: z.string(),
	accesedProjects: z.array(z.string()).optional(),
	accesedServices: z.array(z.string()).optional(),
	canCreateProjects: z.boolean().optional(),
	canCreateServices: z.boolean().optional(),
	canDeleteProjects: z.boolean().optional(),
	canDeleteServices: z.boolean().optional(),
	canAccessToDocker: z.boolean().optional(),
	canAccessToTraefikFiles: z.boolean().optional(),
});

export const apiCreateUserInvitation = createSchema.pick({}).extend({
	email: z.string().email(),
});

export const apiRemoveUser = createSchema
	.pick({
		authId: true,
	})
	.required();

export const apiFindOneToken = createSchema
	.pick({
		token: true,
	})
	.required();

export const apiAssignPermissions = createSchema
	.pick({
		userId: true,
		canCreateProjects: true,
		canCreateServices: true,
		canDeleteProjects: true,
		canDeleteServices: true,
		accesedProjects: true,
		accesedServices: true,
		canAccessToTraefikFiles: true,
		canAccessToDocker: true,
		canAccessToAPI: true,
	})
	.required();

export const apiFindOneUser = createSchema
	.pick({
		userId: true,
	})
	.required();

export const apiFindOneUserByAuth = createSchema
	.pick({
		authId: true,
	})
	.required();
