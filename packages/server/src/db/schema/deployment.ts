import { is, relations } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { previewDeployments } from "./preview-deployments";
import { server } from "./server";

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
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
	isPreviewDeployment: boolean("isPreviewDeployment").default(false),
	previewDeploymentId: text("previewDeploymentId").references(
		(): AnyPgColumn => previewDeployments.previewDeploymentId,
		{ onDelete: "cascade" },
	),
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
	server: one(server, {
		fields: [deployments.serverId],
		references: [server.serverId],
	}),
	previewDeployment: one(previewDeployments, {
		fields: [deployments.previewDeploymentId],
		references: [previewDeployments.previewDeploymentId],
	}),
}));

const schema = createInsertSchema(deployments, {
	title: z.string().min(1),
	status: z.string().default("running"),
	logPath: z.string().min(1),
	applicationId: z.string(),
	composeId: z.string(),
	description: z.string().optional(),
	previewDeploymentId: z.string(),
});

export const apiCreateDeployment = schema
	.pick({
		title: true,
		status: true,
		logPath: true,
		applicationId: true,
		description: true,
		previewDeploymentId: true,
	})
	.extend({
		applicationId: z.string().min(1),
	});

export const apiCreateDeploymentPreview = schema
	.pick({
		title: true,
		status: true,
		logPath: true,
		description: true,
		previewDeploymentId: true,
	})
	.extend({
		previewDeploymentId: z.string().min(1),
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

export const apiCreateDeploymentServer = schema
	.pick({
		title: true,
		status: true,
		logPath: true,
		serverId: true,
		description: true,
	})
	.extend({
		serverId: z.string().min(1),
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

export const apiFindAllByServer = schema
	.pick({
		serverId: true,
	})
	.extend({
		serverId: z.string().min(1),
	})
	.required();
