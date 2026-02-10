import { relations } from "drizzle-orm";
import { json, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { user } from "./user";

export const activityLogs = pgTable("activity_log", {
	activityLogId: text("activityLogId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userId: text("userId").references(() => user.id, {
		onDelete: "set null",
	}),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, {
			onDelete: "cascade",
		}),
	action: text("action").notNull(), // e.g., "application.create", "deployment.trigger"
	resourceType: text("resourceType").notNull(), // e.g., "application", "database", "server"
	resourceId: text("resourceId"),
	metadata: json("metadata").$type<Record<string, any>>(),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
	user: one(user, {
		fields: [activityLogs.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [activityLogs.organizationId],
		references: [organization.id],
	}),
}));

export const activityLogSchema = createInsertSchema(activityLogs, {
	activityLogId: z.string(),
	createdAt: z.date(),
});

export const apiFindAllActivityLogs = z.object({
	organizationId: z.string().optional(),
	userId: z.string().optional(),
	resourceType: z.string().optional(),
	resourceId: z.string().optional(),
	page: z.number().default(1),
	pageSize: z.number().default(50),
});
