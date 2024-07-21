import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { compose } from "./compose";
import { certificateType } from "./shared";

export const domainsCompose = pgTable("domain_compose", {
	domainComposeId: text("domainComposeId")
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
	composeId: text("composeId")
		.notNull()
		.references(() => compose.composeId, { onDelete: "cascade" }),
	certificateType: certificateType("certificateType").notNull().default("none"),
});

export const domainsComposeRelations = relations(domainsCompose, ({ one }) => ({
	compose: one(compose, {
		fields: [domainsCompose.composeId],
		references: [compose.composeId],
	}),
}));
const createSchema = createInsertSchema(domainsCompose, {
	composeId: z.string().min(1),
	host: z.string().min(1),
	path: z.string().min(1),
	port: z.number(),
	https: z.boolean(),
	domainComposeId: z.string(),
	certificateType: z.enum(["letsencrypt", "none"]),
});

export const apiCreateDomainCompose = createSchema
	.pick({
		host: true,
		path: true,
		port: true,
		https: true,
		composeId: true,
		certificateType: true,
	})
	.required();

export const apiFindDomainCompose = createSchema
	.pick({
		domainComposeId: true,
	})
	.required();

export const apiFindDomainByApplicationCompose = createSchema
	.pick({
		composeId: true,
	})
	.required();

export const apiUpdateDomainCompose = createSchema
	.pick({
		domainComposeId: true,
		host: true,
		path: true,
		port: true,
		https: true,
		certificateType: true,
	})
	.required();
