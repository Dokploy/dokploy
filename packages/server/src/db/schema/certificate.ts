import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";
import { generateAppName } from "./utils";

export const renewalStatus = pgEnum("renewalStatus", [
	"pending",
	"success",
	"failed",
	"not_configured",
]);

export const certificates = pgTable("certificate", {
	certificateId: text("certificateId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	certificateData: text("certificateData").notNull(),
	privateKey: text("privateKey").notNull(),
	certificatePath: text("certificatePath")
		.notNull()
		.$defaultFn(() => generateAppName("certificate"))
		.unique(),
	autoRenew: boolean("autoRenew"),
	domains: text("domains").array(),
	expiresAt: timestamp("expiresAt"),
	issuer: text("issuer"),
	subject: text("subject"),
	isWildcard: boolean("isWildcard").default(false),
	autoRenewEnabled: boolean("autoRenewEnabled").default(false),
	renewalStatus: renewalStatus("renewalStatus").default("not_configured"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const certificatesRelations = relations(certificates, ({ one }) => ({
	server: one(server, {
		fields: [certificates.serverId],
		references: [server.serverId],
	}),
	organization: one(organization, {
		fields: [certificates.organizationId],
		references: [organization.id],
	}),
}));

export const apiCreateCertificate = createInsertSchema(certificates, {
	name: z.string().min(1),
	certificateData: z.string().min(1),
	privateKey: z.string().min(1),
	autoRenew: z.boolean().optional(),
	serverId: z.string().optional(),
	domains: z.array(z.string()).optional(),
	expiresAt: z.date().optional(),
	issuer: z.string().optional(),
	subject: z.string().optional(),
	isWildcard: z.boolean().optional(),
	autoRenewEnabled: z.boolean().optional(),
	renewalStatus: z.enum(["pending", "success", "failed", "not_configured"]).optional(),
});

export const apiFindCertificate = z.object({
	certificateId: z.string().min(1),
});

export const apiUpdateCertificate = z.object({
	certificateId: z.string().min(1),
	name: z.string().min(1).optional(),
	certificateData: z.string().min(1).optional(),
	privateKey: z.string().min(1).optional(),
	autoRenew: z.boolean().optional(),
	domains: z.array(z.string()).optional(),
	expiresAt: z.date().optional(),
	issuer: z.string().optional(),
	subject: z.string().optional(),
	isWildcard: z.boolean().optional(),
	autoRenewEnabled: z.boolean().optional(),
	renewalStatus: z.enum(["pending", "success", "failed", "not_configured"]).optional(),
});

export const apiDeleteCertificate = z.object({
	certificateId: z.string().min(1),
});
