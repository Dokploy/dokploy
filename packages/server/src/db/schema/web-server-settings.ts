import { relations } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { certificateType } from "./shared";

export const webServerSettings = pgTable("webServerSettings", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	// Web Server Configuration
	serverIp: text("serverIp"),
	certificateType: certificateType("certificateType").notNull().default("none"),
	https: boolean("https").notNull().default(false),
	host: text("host"),
	letsEncryptEmail: text("letsEncryptEmail"),
	sshPrivateKey: text("sshPrivateKey"),
	enableDockerCleanup: boolean("enableDockerCleanup").notNull().default(true),
	logCleanupCron: text("logCleanupCron").default("0 0 * * *"),
	// Metrics Configuration
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
	// Whitelabeling Configuration (Enterprise / Proprietary)
	whitelabelingConfig: jsonb("whitelabelingConfig")
		.$type<{
			appName: string | null;
			appDescription: string | null;
			logoUrl: string | null;
			faviconUrl: string | null;
			customCss: string | null;
			loginLogoUrl: string | null;
			supportUrl: string | null;
			docsUrl: string | null;
			errorPageTitle: string | null;
			errorPageDescription: string | null;
			metaTitle: string | null;
			footerText: string | null;
		}>()
		.default({
			appName: null,
			appDescription: null,
			logoUrl: null,
			faviconUrl: null,
			customCss: null,
			loginLogoUrl: null,
			supportUrl: null,
			docsUrl: null,
			errorPageTitle: null,
			errorPageDescription: null,
			metaTitle: null,
			footerText: null,
		}),
	// Domain Restriction Configuration
	domainRestrictionConfig: jsonb("domainRestrictionConfig")
		.$type<{
			enabled: boolean;
			allowedWildcards: string[];
		}>()
		.default({
			enabled: false,
			allowedWildcards: [],
		}),
	// Cache Cleanup Configuration
	cleanupCacheApplications: boolean("cleanupCacheApplications")
		.notNull()
		.default(false),
	cleanupCacheOnPreviews: boolean("cleanupCacheOnPreviews")
		.notNull()
		.default(false),
	cleanupCacheOnCompose: boolean("cleanupCacheOnCompose")
		.notNull()
		.default(false),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const webServerSettingsRelations = relations(
	webServerSettings,
	() => ({}),
);

const createSchema = createInsertSchema(webServerSettings, {
	id: z.string().min(1),
});

export const apiUpdateWebServerSettings = createSchema.partial().extend({
	serverIp: z.string().optional(),
	certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
	https: z.boolean().optional(),
	host: z.string().optional(),
	letsEncryptEmail: z.string().email().optional().nullable(),
	sshPrivateKey: z.string().optional(),
	enableDockerCleanup: z.boolean().optional(),
	logCleanupCron: z.string().optional().nullable(),
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
	cleanupCacheApplications: z.boolean().optional(),
	cleanupCacheOnPreviews: z.boolean().optional(),
	cleanupCacheOnCompose: z.boolean().optional(),
});

export const apiAssignDomain = z
	.object({
		host: z.string(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]),
		letsEncryptEmail: z
			.union([z.string().email(), z.literal("")])
			.optional()
			.nullable(),
		https: z.boolean().optional(),
	})
	.required()
	.partial({
		letsEncryptEmail: true,
		https: true,
	});

export const apiSaveSSHKey = z
	.object({
		sshPrivateKey: z.string(),
	})
	.required();

export const apiUpdateDockerCleanup = z.object({
	enableDockerCleanup: z.boolean(),
	serverId: z.string().optional(),
});

// Whitelabeling validation schemas
const safeUrl = z
	.string()
	.refine((url) => /^https?:\/\//i.test(url), {
		message: "Only http:// and https:// URLs are allowed",
	})
	.nullable();

export const whitelabelingConfigSchema = z.object({
	appName: z.string().nullable(),
	appDescription: z.string().nullable(),
	logoUrl: safeUrl,
	faviconUrl: safeUrl,
	customCss: z.string().nullable(),
	loginLogoUrl: safeUrl,
	supportUrl: safeUrl,
	docsUrl: safeUrl,
	errorPageTitle: z.string().nullable(),
	errorPageDescription: z.string().nullable(),
	metaTitle: z.string().nullable(),
	footerText: z.string().nullable(),
});

export const apiUpdateWhitelabeling = z.object({
	whitelabelingConfig: whitelabelingConfigSchema,
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

// Domain Restriction validation schemas
export const domainRestrictionConfigSchema = z.object({
	enabled: z.boolean(),
	allowedWildcards: z.array(
		z.string().min(1).refine(
			(s) => s.startsWith("*.") || s.startsWith("**."),
			{ message: "Pattern must start with '*.' or '**.' (e.g. *.example.com)" },
		),
	),
});
