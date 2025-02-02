import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	json,
	jsonb,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { auth } from "./auth";
import { certificates } from "./certificate";
import { registry } from "./registry";
import { certificateType } from "./shared";
import { sshKeys } from "./ssh-key";
import { users } from "./user";

export const admins = pgTable("admin", {
	adminId: text("adminId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	serverIp: text("serverIp"),
	certificateType: certificateType("certificateType").notNull().default("none"),
	host: text("host"),
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
	stripeCustomerId: text("stripeCustomerId"),
	stripeSubscriptionId: text("stripeSubscriptionId"),
	serversQuantity: integer("serversQuantity").notNull().default(0),

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
});

export const adminsRelations = relations(admins, ({ one, many }) => ({
	auth: one(auth, {
		fields: [admins.authId],
		references: [auth.id],
	}),
	users: many(users),
	registry: many(registry),
	sshKeys: many(sshKeys),
	certificates: many(certificates),
}));

const createSchema = createInsertSchema(admins, {
	adminId: z.string(),
	enableDockerCleanup: z.boolean().optional(),
	sshPrivateKey: z.string().optional(),
	certificateType: z.enum(["letsencrypt", "none"]).default("none"),
	serverIp: z.string().optional(),
	letsEncryptEmail: z.string().optional(),
});

export const apiUpdateAdmin = createSchema.partial();

export const apiSaveSSHKey = createSchema
	.pick({
		sshPrivateKey: true,
	})
	.required();

export const apiAssignDomain = createSchema
	.pick({
		host: true,
		certificateType: true,
		letsEncryptEmail: true,
	})
	.required()
	.partial({
		letsEncryptEmail: true,
	});

export const apiUpdateDockerCleanup = createSchema
	.pick({
		enableDockerCleanup: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});

export const apiTraefikConfig = z.object({
	traefikConfig: z.string().min(1),
});

export const apiModifyTraefikConfig = z.object({
	path: z.string().min(1),
	traefikConfig: z.string().min(1),
	serverId: z.string().optional(),
});
export const apiReadTraefikConfig = z.object({
	path: z.string().min(1),
	serverId: z.string().optional(),
});

export const apiEnableDashboard = z.object({
	enableDashboard: z.boolean().optional(),
	serverId: z.string().optional(),
});

export const apiServerSchema = z
	.object({
		serverId: z.string().optional(),
	})
	.optional();

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

export const apiUpdateWebServerMonitoring = z.object({
	metricsConfig: z
		.object({
			server: z.object({
				refreshRate: z.number().min(2),
				port: z.number().min(1),
				token: z.string(),
				urlCallback: z.string().url(),
				retentionDays: z.number().min(1),
				cronJob: z.string().min(1),
				thresholds: z.object({
					cpu: z.number().min(0),
					memory: z.number().min(0),
				}),
			}),
			containers: z.object({
				refreshRate: z.number().min(2),
				services: z.object({
					include: z.array(z.string()).optional(),
					exclude: z.array(z.string()).optional(),
				}),
			}),
		})
		.required(),
});
