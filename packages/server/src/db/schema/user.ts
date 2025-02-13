import { relations, sql } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { admins } from "./admin";
import { auth } from "./auth";
import { certificateType } from "./shared";
/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */

// OLD TABLE

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
	canAccessToSSHKeys: boolean("canAccessToSSHKeys").notNull().default(false),
	canCreateServices: boolean("canCreateServices").notNull().default(false),
	canDeleteProjects: boolean("canDeleteProjects").notNull().default(false),
	canDeleteServices: boolean("canDeleteServices").notNull().default(false),
	canAccessToDocker: boolean("canAccessToDocker").notNull().default(false),
	canAccessToAPI: boolean("canAccessToAPI").notNull().default(false),
	canAccessToGitProviders: boolean("canAccessToGitProviders")
		.notNull()
		.default(false),
	canAccessToTraefikFiles: boolean("canAccessToTraefikFiles")
		.notNull()
		.default(false),
	accessedProjects: text("accesedProjects")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	accessedServices: text("accesedServices")
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

// TEMP
export const users_temp = pgTable("user_temp", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull().default(""),
	token: text("token").notNull(),
	isRegistered: boolean("isRegistered").notNull().default(false),
	expirationDate: text("expirationDate")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	canCreateProjects: boolean("canCreateProjects").notNull().default(false),
	canAccessToSSHKeys: boolean("canAccessToSSHKeys").notNull().default(false),
	canCreateServices: boolean("canCreateServices").notNull().default(false),
	canDeleteProjects: boolean("canDeleteProjects").notNull().default(false),
	canDeleteServices: boolean("canDeleteServices").notNull().default(false),
	canAccessToDocker: boolean("canAccessToDocker").notNull().default(false),
	canAccessToAPI: boolean("canAccessToAPI").notNull().default(false),
	canAccessToGitProviders: boolean("canAccessToGitProviders")
		.notNull()
		.default(false),
	canAccessToTraefikFiles: boolean("canAccessToTraefikFiles")
		.notNull()
		.default(false),
	accessedProjects: text("accesedProjects")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	accessedServices: text("accesedServices")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	// authId: text("authId")
	// 	.notNull()
	// 	.references(() => auth.id, { onDelete: "cascade" }),
	// Auth
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	role: text("role"),
	banned: boolean("banned"),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
	updatedAt: timestamp("updated_at").notNull(),
	// Admin
	serverIp: text("serverIp"),
	certificateType: certificateType("certificateType").notNull().default("none"),
	host: text("host"),
	letsEncryptEmail: text("letsEncryptEmail"),
	sshPrivateKey: text("sshPrivateKey"),
	enableDockerCleanup: boolean("enableDockerCleanup").notNull().default(false),
	enableLogRotation: boolean("enableLogRotation").notNull().default(false),
	// Metrics
	enablePaidFeatures: boolean("enablePaidFeatures").notNull().default(false),
	metricsConfig: jsonb("metricsConfig")
		.$type<{
			server: {
				type: "Dokploy" | "Remote";
				refreshRate: number;
				port: number;
				token: string;
				urlCallback: string;
				retentionDays: number;
				cronJob: string;
				thresholds: {
					cpu: number;
					memory: number;
				};
			};
			containers: {
				refreshRate: number;
				services: {
					include: string[];
					exclude: string[];
				};
			};
		}>()
		.notNull()
		.default({
			server: {
				type: "Dokploy",
				refreshRate: 60,
				port: 4500,
				token: "",
				retentionDays: 2,
				cronJob: "",
				urlCallback: "",
				thresholds: {
					cpu: 0,
					memory: 0,
				},
			},
			containers: {
				refreshRate: 60,
				services: {
					include: [],
					exclude: [],
				},
			},
		}),
	cleanupCacheApplications: boolean("cleanupCacheApplications")
		.notNull()
		.default(false),
	cleanupCacheOnPreviews: boolean("cleanupCacheOnPreviews")
		.notNull()
		.default(false),
	cleanupCacheOnCompose: boolean("cleanupCacheOnCompose")
		.notNull()
		.default(false),
	stripeCustomerId: text("stripeCustomerId"),
	stripeSubscriptionId: text("stripeSubscriptionId"),
	serversQuantity: integer("serversQuantity").notNull().default(0),
});

export const usersRelations = relations(users, ({ one }) => ({
	auth: one(auth, {
		fields: [users.authId],
		references: [auth.id],
	}),
	// admin: one(admins, {
	// 	fields: [users.adminId],
	// 	references: [admins.adminId],
	// }),
}));

const createSchema = createInsertSchema(users, {
	userId: z.string().min(1),
	// authId: z.string().min(1),
	token: z.string().min(1),
	isRegistered: z.boolean().optional(),
	// adminId: z.string(),
	accessedProjects: z.array(z.string()).optional(),
	accessedServices: z.array(z.string()).optional(),
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
		// authId: true,
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
		accessedProjects: true,
		accessedServices: true,
		canAccessToTraefikFiles: true,
		canAccessToDocker: true,
		canAccessToAPI: true,
		canAccessToSSHKeys: true,
		canAccessToGitProviders: true,
	})
	.required();

export const apiFindOneUser = createSchema
	.pick({
		userId: true,
	})
	.required();

export const apiFindOneUserByAuth = createSchema
	.pick({
		// authId: true,
	})
	.required();
