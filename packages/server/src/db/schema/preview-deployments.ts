import { isNotNull, relations } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { deployments } from "./deployment";
import { domains } from "./domain";
import { applicationStatus } from "./shared";
import { generateAppName } from "./utils";

export const PREVIEW_PULL_REQUEST_IMAGE_INDEX =
	"preview_deployments_app_pull_request_image_idx";

export const previewDeployments = pgTable(
	"preview_deployments",
	{
		previewDeploymentId: text("previewDeploymentId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		branch: text("branch").notNull(),
		pullRequestId: text("pullRequestId").notNull(),
		pullRequestNumber: text("pullRequestNumber").notNull(),
		pullRequestURL: text("pullRequestURL").notNull(),
		pullRequestTitle: text("pullRequestTitle").notNull(),
		pullRequestCommentId: text("pullRequestCommentId").notNull(),
		previewStatus: applicationStatus("previewStatus").notNull().default("idle"),
		appName: text("appName")
			.notNull()
			.$defaultFn(() => generateAppName("preview"))
			.unique(),
		applicationId: text("applicationId")
			.notNull()
			.references(() => applications.applicationId, {
				onDelete: "cascade",
			}),
		domainId: text("domainId").references(() => domains.domainId, {
			onDelete: "cascade",
		}),
		dockerImage: text("dockerImage"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		expiresAt: text("expiresAt"),
	},
	(table) => [
		// Only image previews: GitHub previews may already have duplicates per pull request.
		uniqueIndex(PREVIEW_PULL_REQUEST_IMAGE_INDEX)
			.on(table.applicationId, table.pullRequestNumber)
			.where(isNotNull(table.dockerImage)),
	],
);

export const previewDeploymentsRelations = relations(
	previewDeployments,
	({ one, many }) => ({
		deployments: many(deployments),
		domain: one(domains, {
			fields: [previewDeployments.domainId],
			references: [domains.domainId],
		}),
		application: one(applications, {
			fields: [previewDeployments.applicationId],
			references: [applications.applicationId],
		}),
	}),
);

export const createSchema = createInsertSchema(previewDeployments, {
	applicationId: z.string(),
});

export const apiCreatePreviewDeployment = z.object({
	applicationId: z.string().min(1),
	domainId: z.string().optional(),
	branch: z.string().min(1),
	pullRequestId: z.string().min(1),
	pullRequestNumber: z.string().min(1),
	pullRequestURL: z.string().min(1),
	pullRequestTitle: z.string().min(1),
	dockerImage: z.string().nullish(),
});

export const apiDeployPreviewFromImage = z.object({
	applicationId: z.string().min(1),
	dockerImage: z.string().min(1),
	pullRequestNumber: z.string().min(1),
	pullRequestTitle: z.string().optional(),
	pullRequestURL: z.url({ protocol: /^https?$/ }).optional(),
	branch: z.string().optional(),
});

export const apiFindPreviewByPullRequest = z.object({
	applicationId: z.string().min(1),
	pullRequestNumber: z.string().min(1),
});
