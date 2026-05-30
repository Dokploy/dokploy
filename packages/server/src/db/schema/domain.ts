import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { domain } from "../validations/domain";
import { applications } from "./application";
import { cloudflare } from "./cloudflare";
import { compose } from "./compose";
import { previewDeployments } from "./preview-deployments";
import { certificateType } from "./shared";

export const domainType = pgEnum("domainType", [
	"compose",
	"application",
	"preview",
]);

export const cloudflareTunnelMode = pgEnum("cloudflareTunnelMode", [
	"existing-instance",
	"shared-managed",
]);

export const domains = pgTable("domain", {
	domainId: text("domainId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	host: text("host").notNull(),
	https: boolean("https").notNull().default(false),
	port: integer("port").default(3000),
	customEntrypoint: text("customEntrypoint"),
	path: text("path").default("/"),
	serviceName: text("serviceName"),
	domainType: domainType("domainType").default("application"),
	uniqueConfigKey: serial("uniqueConfigKey"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	composeId: text("composeId").references(() => compose.composeId, {
		onDelete: "cascade",
	}),
	customCertResolver: text("customCertResolver"),
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{ onDelete: "cascade" },
	),
	previewDeploymentId: text("previewDeploymentId").references(
		(): AnyPgColumn => previewDeployments.previewDeploymentId,
		{ onDelete: "cascade" },
	),
	certificateType: certificateType("certificateType").notNull().default("none"),
	internalPath: text("internalPath").default("/"),
	stripPath: boolean("stripPath").notNull().default(false),
	middlewares: text("middlewares").array().default(sql`ARRAY[]::text[]`),
	// --- Cloudflare Tunnel publishing ---
	// User-settable intent + selection (validated as admin-only at the router):
	publishToCloudflare: boolean("publishToCloudflare").notNull().default(false),
	cloudflareTunnelMode: cloudflareTunnelMode("cloudflareTunnelMode"),
	cloudflareId: text("cloudflareId").references(() => cloudflare.cloudflareId, {
		onDelete: "set null",
	}),
	cloudflareZoneId: text("cloudflareZoneId"),
	cloudflareTunnelId: text("cloudflareTunnelId"),
	// Server-managed provisioning status (set by the provisioning module):
	cloudflareDnsRecordId: text("cloudflareDnsRecordId"),
	cloudflareIngressApplied: boolean("cloudflareIngressApplied")
		.notNull()
		.default(false),
	// --- Cloudflare Access (Zero Trust) ---
	// Managed by the cloudflareAccess router (server-managed status):
	enableCloudflareAccess: boolean("enableCloudflareAccess")
		.notNull()
		.default(false),
	cloudflareAccessApplicationId: text("cloudflareAccessApplicationId"),
});

export const domainsRelations = relations(domains, ({ one }) => ({
	application: one(applications, {
		fields: [domains.applicationId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [domains.composeId],
		references: [compose.composeId],
	}),
	previewDeployment: one(previewDeployments, {
		fields: [domains.previewDeploymentId],
		references: [previewDeployments.previewDeploymentId],
	}),
	cloudflare: one(cloudflare, {
		fields: [domains.cloudflareId],
		references: [cloudflare.cloudflareId],
	}),
}));

const createSchema = createInsertSchema(domains, {
	...domain.shape,
	// Override pgEnum so Zod 4 infers only string literals, not numeric enum index
	domainType: z.enum(["compose", "application", "preview"]).optional(),
	cloudflareTunnelMode: z
		.enum(["existing-instance", "shared-managed"])
		.optional(),
	publishToCloudflare: z.boolean().optional(),
	cloudflareId: z.string().nullish(),
	cloudflareZoneId: z.string().nullish(),
	cloudflareTunnelId: z.string().nullish(),
});

export const apiCreateDomain = createSchema.pick({
	host: true,
	path: true,
	port: true,
	customEntrypoint: true,
	https: true,
	applicationId: true,
	certificateType: true,
	customCertResolver: true,
	composeId: true,
	serviceName: true,
	domainType: true,
	previewDeploymentId: true,
	internalPath: true,
	stripPath: true,
	middlewares: true,
	publishToCloudflare: true,
	cloudflareTunnelMode: true,
	cloudflareId: true,
	cloudflareZoneId: true,
	cloudflareTunnelId: true,
});

export const apiFindDomain = z.object({
	domainId: z.string().min(1),
});

export const apiFindDomainByApplication = createSchema.pick({
	applicationId: true,
});

export const apiCreateTraefikMeDomain = createSchema.pick({}).extend({
	appName: z.string().min(1),
});

export const apiFindDomainByCompose = createSchema.pick({
	composeId: true,
});

export const apiUpdateDomain = createSchema
	.pick({
		host: true,
		path: true,
		port: true,
		customEntrypoint: true,
		https: true,
		certificateType: true,
		customCertResolver: true,
		serviceName: true,
		domainType: true,
		internalPath: true,
		stripPath: true,
		middlewares: true,
		publishToCloudflare: true,
		cloudflareTunnelMode: true,
		cloudflareId: true,
		cloudflareZoneId: true,
		cloudflareTunnelId: true,
	})
	.merge(createSchema.pick({ domainId: true }).required());
