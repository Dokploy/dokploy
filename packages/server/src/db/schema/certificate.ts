import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { server } from "./server";
// import { user } from "./user";
import { generateAppName } from "./utils";
import { admins } from "./admin";
import { users_temp } from "./user";

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
	// userId: text("userId").references(() => user.userId, {
	// 	onDelete: "cascade",
	// }),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const certificatesRelations = relations(
	certificates,
	({ one, many }) => ({
		server: one(server, {
			fields: [certificates.serverId],
			references: [server.serverId],
		}),
		admin: one(admins, {
			fields: [certificates.adminId],
			references: [admins.adminId],
		}),
	}),
);

export const apiCreateCertificate = createInsertSchema(certificates, {
	name: z.string().min(1),
	certificateData: z.string().min(1),
	privateKey: z.string().min(1),
	autoRenew: z.boolean().optional(),
	serverId: z.string().optional(),
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
});

export const apiDeleteCertificate = z.object({
	certificateId: z.string().min(1),
});
