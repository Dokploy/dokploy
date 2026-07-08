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
import { compose } from "./compose";
import { previewDeployments } from "./preview-deployments";
import { certificateType } from "./shared";

export const domainType = pgEnum("domainType", [
	"compose",
	"application",
	"preview",
]);

export const domainValidationMode = pgEnum("domainValidationMode", [
	"auto",
	"proxy",
	"skip",
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
	forwardAuthEnabled: boolean("forwardAuthEnabled").notNull().default(false),
	// How the "Validate" badge checks the domain's DNS:
	// - auto: match against the server's detected IPs (default)
	// - proxy: match against a user-provided IP (reverse proxy / load balancer)
	// - skip: only confirm the domain resolves, without matching an IP
	validationMode: domainValidationMode("validationMode")
		.notNull()
		.default("auto"),
	// The IP the domain is expected to resolve to when validationMode is "proxy".
	expectedIp: text("expectedIp"),
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
}));

const createSchema = createInsertSchema(domains, {
	...domain.shape,
	// Override pgEnum so Zod 4 infers only string literals, not numeric enum index
	domainType: z.enum(["compose", "application", "preview"]).optional(),
	validationMode: z.enum(["auto", "proxy", "skip"]).optional(),
	expectedIp: z.string().nullable().optional(),
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
	forwardAuthEnabled: true,
	validationMode: true,
	expectedIp: true,
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
		forwardAuthEnabled: true,
		validationMode: true,
		expectedIp: true,
	})
	.merge(createSchema.pick({ domainId: true }).required());
