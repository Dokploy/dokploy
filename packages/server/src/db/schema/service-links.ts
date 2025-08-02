import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { redis } from "./redis";

export const serviceLinkType = pgEnum("serviceLinkType", [
	"application",
	"compose", 
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
]);

export const serviceAttribute = pgEnum("serviceAttribute", [
	"fqdn",         // Fully Qualified Domain Name (public URL)
	"hostname",     // Internal hostname
	"port",         // Internal port
]);

export const serviceLinks = pgTable("serviceLink", {
	serviceLinkId: text("serviceLinkId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	
	// Source service (the one that needs the dependency)
	sourceServiceId: text("sourceServiceId").notNull(),
	sourceServiceType: serviceLinkType("sourceServiceType").notNull(),
	
	// Target service (the one being referenced)
	targetServiceId: text("targetServiceId").notNull(),
	targetServiceType: serviceLinkType("targetServiceType").notNull(),
	
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

// Separate table for service link attributes (many-to-one with serviceLinks)
export const serviceLinkAttributes = pgTable("serviceLinkAttribute", {
	serviceLinkAttributeId: text("serviceLinkAttributeId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	
	// Reference to the service link
	serviceLinkId: text("serviceLinkId")
		.notNull()
		.references(() => serviceLinks.serviceLinkId, { onDelete: "cascade" }),
	
	// What attribute of the target service to expose
	attribute: serviceAttribute("attribute").notNull(),
	
	// Environment variable name to inject into source service
	envVariableName: text("envVariableName").notNull(),
	
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const serviceLinksRelations = relations(serviceLinks, ({ one, many }) => ({
	sourceApplication: one(applications, {
		fields: [serviceLinks.sourceServiceId],
		references: [applications.applicationId],
		relationName: "sourceApplication",
	}),
	targetApplication: one(applications, {
		fields: [serviceLinks.targetServiceId],
		references: [applications.applicationId],
		relationName: "targetApplication",
	}),
	sourceCompose: one(compose, {
		fields: [serviceLinks.sourceServiceId],
		references: [compose.composeId],
		relationName: "sourceCompose",
	}),
	targetCompose: one(compose, {
		fields: [serviceLinks.targetServiceId],
		references: [compose.composeId],
		relationName: "targetCompose",
	}),
	sourcePostgres: one(postgres, {
		fields: [serviceLinks.sourceServiceId],
		references: [postgres.postgresId],
		relationName: "sourcePostgres",
	}),
	targetPostgres: one(postgres, {
		fields: [serviceLinks.targetServiceId],
		references: [postgres.postgresId],
		relationName: "targetPostgres",
	}),
	sourceMysql: one(mysql, {
		fields: [serviceLinks.sourceServiceId],
		references: [mysql.mysqlId],
		relationName: "sourceMysql",
	}),
	targetMysql: one(mysql, {
		fields: [serviceLinks.targetServiceId],
		references: [mysql.mysqlId],
		relationName: "targetMysql",
	}),
	sourceMariadb: one(mariadb, {
		fields: [serviceLinks.sourceServiceId],
		references: [mariadb.mariadbId],
		relationName: "sourceMariadb",
	}),
	targetMariadb: one(mariadb, {
		fields: [serviceLinks.targetServiceId],
		references: [mariadb.mariadbId],
		relationName: "targetMariadb",
	}),
	sourceMongo: one(mongo, {
		fields: [serviceLinks.sourceServiceId],
		references: [mongo.mongoId],
		relationName: "sourceMongo",
	}),
	targetMongo: one(mongo, {
		fields: [serviceLinks.targetServiceId],
		references: [mongo.mongoId],
		relationName: "targetMongo",
	}),
	sourceRedis: one(redis, {
		fields: [serviceLinks.sourceServiceId],
		references: [redis.redisId],
		relationName: "sourceRedis",
	}),
	targetRedis: one(redis, {
		fields: [serviceLinks.targetServiceId],
		references: [redis.redisId],
		relationName: "targetRedis",
	}),
	// Relation to attributes
	attributes: many(serviceLinkAttributes),
}));

export const serviceLinkAttributesRelations = relations(serviceLinkAttributes, ({ one }) => ({
	serviceLink: one(serviceLinks, {
		fields: [serviceLinkAttributes.serviceLinkId],
		references: [serviceLinks.serviceLinkId],
	}),
}));

// API schemas
const createSchema = createInsertSchema(serviceLinks);
const createAttributeSchema = createInsertSchema(serviceLinkAttributes);

export const apiCreateServiceLink = createSchema.pick({
	sourceServiceId: true,
	sourceServiceType: true,
	targetServiceId: true,
	targetServiceType: true,
}).extend({
	attributes: z.array(z.object({
		attribute: z.enum(["fqdn", "hostname", "port"]),
		envVariableName: z.string(),
	})).min(1, "At least one attribute must be selected"),
});

export const apiFindServiceLink = z.object({
	serviceLinkId: z.string(),
});

export const apiUpdateServiceLink = createSchema
	.pick({
		targetServiceId: true,
		targetServiceType: true,
	})
	.extend({
		serviceLinkId: z.string(),
		attributes: z.array(z.object({
			attribute: z.enum(["fqdn", "hostname", "port"]),
			envVariableName: z.string(),
		})).min(1, "At least one attribute must be selected"),
	});

export const apiDeleteServiceLink = z.object({
	serviceLinkId: z.string(),
});

export const apiListServiceLinks = z.object({
	sourceServiceId: z.string(),
	sourceServiceType: z.enum([
		"application",
		"compose",
		"postgres", 
		"mysql",
		"mariadb",
		"mongo",
		"redis",
	]),
});