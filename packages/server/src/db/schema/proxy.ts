import { relations } from "drizzle-orm";
import { boolean, integer, json, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { applications } from "./application";
import { compose } from "./compose";
import { certificates } from "./certificate";
import { server } from "./server";
import { certificateType } from "./shared";

export const proxyTargetType = pgEnum("proxyTargetType", [
	"url",
	"application",
	"compose",
	"service",
]);

export const proxyStatus = pgEnum("proxyStatus", [
	"active",
	"inactive",
	"error",
]);

export const proxies = pgTable("proxy", {
	proxyId: text("proxyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	host: text("host").notNull(),
	path: text("path").default("/"),
	targetUrl: text("targetUrl"),
	targetType: proxyTargetType("targetType").notNull().default("url"),
	targetId: text("targetId"),
	port: integer("port").default(3000),
	https: boolean("https").notNull().default(false),
	certificateId: text("certificateId").references(() => certificates.certificateId, {
		onDelete: "set null",
	}),
	certificateType: certificateType("certificateType").notNull().default("none"),
	customCertResolver: text("customCertResolver"),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	stripPath: boolean("stripPath").notNull().default(false),
	internalPath: text("internalPath").default("/"),
	middlewares: json("middlewares").$type<Array<Record<string, unknown>>>(),
	priority: integer("priority").default(0),
	isWildcard: boolean("isWildcard").default(false),
	status: proxyStatus("status").notNull().default("active"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const proxiesRelations = relations(proxies, ({ one }) => ({
	server: one(server, {
		fields: [proxies.serverId],
		references: [server.serverId],
	}),
	organization: one(organization, {
		fields: [proxies.organizationId],
		references: [organization.id],
	}),
	certificate: one(certificates, {
		fields: [proxies.certificateId],
		references: [certificates.certificateId],
	}),
	application: one(applications, {
		fields: [proxies.targetId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [proxies.targetId],
		references: [compose.composeId],
	}),
}));

const createSchema = createInsertSchema(proxies, {
	name: z.string().min(1),
	host: z.string().min(1),
	path: z.string().optional(),
	targetUrl: z.string().url().optional(),
	targetType: z.enum(["url", "application", "compose", "service"]),
	targetId: z.string().optional(),
	port: z.number().min(1).max(65535).optional(),
	https: z.boolean().optional(),
	certificateId: z.string().optional(),
	certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
	customCertResolver: z.string().optional(),
	serverId: z.string().optional(),
	stripPath: z.boolean().optional(),
	internalPath: z.string().optional(),
	middlewares: z.array(z.record(z.unknown())).optional(),
	priority: z.number().optional(),
	isWildcard: z.boolean().optional(),
	status: z.enum(["active", "inactive", "error"]).optional(),
});

export const apiCreateProxy = createSchema.pick({
	name: true,
	host: true,
	path: true,
	targetUrl: true,
	targetType: true,
	targetId: true,
	port: true,
	https: true,
	certificateId: true,
	certificateType: true,
	customCertResolver: true,
	serverId: true,
	stripPath: true,
	internalPath: true,
	middlewares: true,
	priority: true,
});

export const apiUpdateProxy = createSchema
	.pick({
		name: true,
		host: true,
		path: true,
		targetUrl: true,
		targetType: true,
		targetId: true,
		port: true,
		https: true,
		certificateId: true,
		certificateType: true,
		customCertResolver: true,
		serverId: true,
		stripPath: true,
		internalPath: true,
		middlewares: true,
		priority: true,
		status: true,
	})
	.merge(createSchema.pick({ proxyId: true }).required());

export const apiFindProxy = z.object({
	proxyId: z.string().min(1),
});

export const apiDeleteProxy = z.object({
	proxyId: z.string().min(1),
});

export const apiLinkProxy = z.object({
	proxyId: z.string().min(1),
	targetType: z.enum(["application", "compose", "service"]),
	targetId: z.string().min(1),
});

export const apiUnlinkProxy = z.object({
	proxyId: z.string().min(1),
});

