import { relations } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { applications } from "./application";
import { createInsertSchema } from "drizzle-zod";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const deploymentStatus = pgEnum("deploymentStatus", [
	"running",
	"done",
	"error",
]);

export const deployments = pgTable("deployment", {
	deploymentId: text("deploymentId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	title: text("title").notNull(),
	status: deploymentStatus("status").default("running"),
	logPath: text("logPath").notNull(),
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, { onDelete: "cascade" }),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const deploymentsRelations = relations(deployments, ({ one }) => ({
	application: one(applications, {
		fields: [deployments.applicationId],
		references: [applications.applicationId],
	}),
}));

const schema = createInsertSchema(deployments, {
	title: z.string().min(1),
	status: z.string().default("running"),
	logPath: z.string().min(1),
	applicationId: z.string().min(1),
});

export const apiCreateDeployment = schema
	.pick({
		title: true,
		status: true,
		logPath: true,
		applicationId: true,
	})
	.required();

export const apiFindAllByApplication = schema
	.pick({
		applicationId: true,
	})
	.required();
