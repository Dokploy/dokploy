import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { auth } from "./auth";
import { registry } from "./registry";
import { certificateType } from "./shared";
import { users } from "./user";

export const admins = pgTable("admin", {
	adminId: text("adminId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	githubAppId: integer("githubAppId"),
	githubAppName: text("githubAppName"),
	serverIp: text("serverIp"),
	certificateType: certificateType("certificateType").notNull().default("none"),
	host: text("host"),
	githubClientId: text("githubClientId"),
	githubClientSecret: text("githubClientSecret"),
	githubInstallationId: text("githubInstallationId"),
	githubPrivateKey: text("githubPrivateKey"),
	githubWebhookSecret: text("githubWebhookSecret"),
	letsEncryptEmail: text("letsEncryptEmail"),
	sshPrivateKey: text("sshPrivateKey"),
	enableDockerCleanup: boolean("enableDockerCleanup").notNull().default(false),
	enableLogRotation: boolean("enableLogRotation").notNull().default(false),
	authId: text("authId")
		.notNull()
		.references(() => auth.id, { onDelete: "cascade" }),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const adminsRelations = relations(admins, ({ one, many }) => ({
	auth: one(auth, {
		fields: [admins.authId],
		references: [auth.id],
	}),
	users: many(users),
	registry: many(registry),
}));

const createSchema = createInsertSchema(admins, {
	adminId: z.string(),
	githubAppName: z.string().optional(),
	githubClientId: z.string().optional(),
	githubClientSecret: z.string().optional(),
	githubInstallationId: z.string().optional(),
	githubPrivateKey: z.string().optional(),
	githubAppId: z.number().optional(),
	enableDockerCleanup: z.boolean().optional(),
	sshPrivateKey: z.string().optional(),
	certificateType: z.enum(["letsencrypt", "none"]).default("none"),
	serverIp: z.string().optional(),
});

export const apiSaveSSHKey = createSchema
	.pick({
		sshPrivateKey: true,
	})
	.required();

export const apiAssignDomain = createSchema
	.pick({
		letsEncryptEmail: true,
		host: true,
		certificateType: true,
	})
	.required();

export const apiUpdateDockerCleanup = createSchema
	.pick({
		enableDockerCleanup: true,
	})
	.required();

export const apiTraefikConfig = z.object({
	traefikConfig: z.string().min(1),
});

export const apiGetBranches = z.object({
	repo: z.string().min(1),
	owner: z.string().min(1),
});
export const apiModifyTraefikConfig = z.object({
	path: z.string().min(1),
	traefikConfig: z.string().min(1),
});
export const apiReadTraefikConfig = z.object({
	path: z.string().min(1),
});

export const apiEnableDashboard = z.object({
	enableDashboard: z.boolean().optional(),
});

export const apiReadStatsLogs = z.object({
	page: z
		.object({
			pageIndex: z.number(),
			pageSize: z.number(),
		})
		.optional(),
	status: z.string().array().optional(),
	search: z.string().optional(),
	sort: z.object({ id: z.string(), desc: z.boolean() }).optional(),
});
