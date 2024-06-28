import { relations } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { applications } from "./application";
import { createInsertSchema } from "drizzle-zod";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { compose } from "./compose";

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
	description: text("description"),
	status: deploymentStatus("status").default("running"),
	logPath: text("logPath").notNull(),
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{ onDelete: "cascade" },
	),
	composeId: text("composeId").references(() => compose.composeId, {
		onDelete: "cascade",
	}),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const deploymentsRelations = relations(deployments, ({ one }) => ({
	application: one(applications, {
		fields: [deployments.applicationId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [deployments.composeId],
		references: [compose.composeId],
	}),
}));

const schema = createInsertSchema(deployments, {
	title: z.string().min(1),
	status: z.string().default("running"),
	logPath: z.string().min(1),
	applicationId: z.string(),
	composeId: z.string(),
	description: z.string().optional(),
});

export const apiCreateDeployment = schema
	.pick({
		title: true,
		status: true,
		logPath: true,
		applicationId: true,
		description: true,
	})
	.extend({
		applicationId: z.string().min(1),
	});

export const apiCreateDeploymentCompose = schema
	.pick({
		title: true,
		status: true,
		logPath: true,
		composeId: true,
		description: true,
	})
	.extend({
		composeId: z.string().min(1),
	});

export const apiFindAllByApplication = schema
	.pick({
		applicationId: true,
	})
	.extend({
		applicationId: z.string().min(1),
	})
	.required();

export const apiFindAllByCompose = schema
	.pick({
		composeId: true,
	})
	.extend({
		composeId: z.string().min(1),
	})
	.required();
