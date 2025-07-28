import { paths } from "@dokploy/server/constants";
import { relations } from "drizzle-orm";
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
import { account, apikey, organization } from "./account";
import { backups } from "./backups";
import { projects } from "./project";
import { schedules } from "./schedule";
import { certificateType } from "./shared";
/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */

// OLD TABLE

// TEMP
export const users_temp = pgTable("user_temp", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull().default(""),
	isRegistered: boolean("isRegistered").notNull().default(false),
	expirationDate: text("expirationDate")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	createdAt2: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	createdAt: timestamp("created_at").defaultNow(),
	// Auth
	twoFactorEnabled: boolean("two_factor_enabled"),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	banned: boolean("banned"),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
	updatedAt: timestamp("updated_at").notNull(),
	// Admin
	serverIp: text("serverIp"),
	certificateType: certificateType("certificateType").notNull().default("none"),
	https: boolean("https").notNull().default(false),
	host: text("host"),
	letsEncryptEmail: text("letsEncryptEmail"),
	sshPrivateKey: text("sshPrivateKey"),
	enableDockerCleanup: boolean("enableDockerCleanup").notNull().default(false),
	logCleanupCron: text("logCleanupCron").default("0 0 * * *"),
	role: text("role").notNull().default("user"),
	// Metrics
	enablePaidFeatures: boolean("enablePaidFeatures").notNull().default(false),
	allowImpersonation: boolean("allowImpersonation").notNull().default(false),
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

export const usersRelations = relations(users_temp, ({ one, many }) => ({
	account: one(account, {
		fields: [users_temp.id],
		references: [account.userId],
	}),
	organizations: many(organization),
	projects: many(projects),
	apiKeys: many(apikey),
	backups: many(backups),
	schedules: many(schedules),
}));

const createSchema = createInsertSchema(users_temp, {
	id: z.string().min(1),
	isRegistered: z.boolean().optional(),
}).omit({
	role: true,
});

export const apiCreateUserInvitation = createSchema.pick({}).extend({
	email: z.string().email(),
});

export const apiRemoveUser = createSchema
	.pick({
		id: true,
	})
	.required();

export const apiFindOneToken = createSchema
	.pick({})
	.required()
	.extend({
		token: z.string().min(1),
	});

export const apiAssignPermissions = createSchema
	.pick({
		id: true,
		// canCreateProjects: true,
		// canCreateServices: true,
		// canDeleteProjects: true,
		// canDeleteServices: true,
		// accessedProjects: true,
		// accessedServices: true,
		// canAccessToTraefikFiles: true,
		// canAccessToDocker: true,
		// canAccessToAPI: true,
		// canAccessToSSHKeys: true,
		// canAccessToGitProviders: true,
	})
	.extend({
		accessedProjects: z.array(z.string()).optional(),
		accessedServices: z.array(z.string()).optional(),
		canCreateProjects: z.boolean().optional(),
		canCreateServices: z.boolean().optional(),
		canDeleteProjects: z.boolean().optional(),
		canDeleteServices: z.boolean().optional(),
		canAccessToDocker: z.boolean().optional(),
		canAccessToTraefikFiles: z.boolean().optional(),
		canAccessToAPI: z.boolean().optional(),
		canAccessToSSHKeys: z.boolean().optional(),
		canAccessToGitProviders: z.boolean().optional(),
	})
	.required();

export const apiFindOneUser = createSchema
	.pick({
		id: true,
	})
	.required();

export const apiFindOneUserByAuth = createSchema
	.pick({
		// authId: true,
	})
	.required();
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
		https: true,
	})
	.required()
	.partial({
		letsEncryptEmail: true,
		https: true,
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
	path: z
		.string()
		.min(1)
		.refine(
			(path) => {
				// Prevent directory traversal attacks
				if (path.includes("../") || path.includes("..\\")) {
					return false;
				}

				const { MAIN_TRAEFIK_PATH } = paths();
				if (path.startsWith("/") && !path.startsWith(MAIN_TRAEFIK_PATH)) {
					return false;
				}
				// Prevent null bytes and other dangerous characters
				if (path.includes("\0") || path.includes("\x00")) {
					return false;
				}
				return true;
			},
			{
				message:
					"Invalid path: path traversal or unauthorized directory access detected",
			},
		),
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
	dateRange: z
		.object({
			start: z.string().optional(),
			end: z.string().optional(),
		})
		.optional(),
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

export const apiUpdateUser = createSchema.partial().extend({
	password: z.string().optional(),
	currentPassword: z.string().optional(),
	name: z.string().optional(),
	metricsConfig: z
		.object({
			server: z.object({
				type: z.enum(["Dokploy", "Remote"]),
				refreshRate: z.number(),
				port: z.number(),
				token: z.string(),
				urlCallback: z.string(),
				retentionDays: z.number(),
				cronJob: z.string(),
				thresholds: z.object({
					cpu: z.number(),
					memory: z.number(),
				}),
			}),
			containers: z.object({
				refreshRate: z.number(),
				services: z.object({
					include: z.array(z.string()),
					exclude: z.array(z.string()),
				}),
			}),
		})
		.optional(),
	logCleanupCron: z.string().optional().nullable(),
});
