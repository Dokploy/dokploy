import { domain } from "@/server/db/validations";
import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { applications } from "./application";
import { certificateType } from "./shared";

export const domains = pgTable("domain", {
	domainId: text("domainId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	host: text("host").notNull(),
	https: boolean("https").notNull().default(false),
	port: integer("port").default(80),
	path: text("path").default("/"),
	uniqueConfigKey: serial("uniqueConfigKey"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, { onDelete: "cascade" }),
	certificateType: certificateType("certificateType").notNull().default("none"),
});

export const domainsRelations = relations(domains, ({ one }) => ({
	application: one(applications, {
		fields: [domains.applicationId],
		references: [applications.applicationId],
	}),
}));

const createSchema = createInsertSchema(domains, domain._def.schema.shape);

export const apiCreateDomain = createSchema.pick({
	host: true,
	path: true,
	port: true,
	https: true,
	applicationId: true,
	certificateType: true,
});

export const apiFindDomain = createSchema
	.pick({
		domainId: true,
	})
	.required();

export const apiFindDomainByApplication = createSchema.pick({
	applicationId: true,
});

export const apiUpdateDomain = createSchema
	.pick({
		host: true,
		path: true,
		port: true,
		https: true,
		certificateType: true,
	})
	.merge(createSchema.pick({ domainId: true }).required());
