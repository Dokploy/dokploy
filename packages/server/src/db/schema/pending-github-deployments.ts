import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { applications } from "./application";
import { compose } from "./compose";

// A deploy triggered by a push but held back until the GitHub checks for
// `headSha` pass. One row per service: a newer push replaces the older row.
export const pendingGithubDeployments = pgTable("pending_github_deployments", {
	pendingGithubDeploymentId: text("pendingGithubDeploymentId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	headSha: text("headSha").notNull(),
	titleLog: text("titleLog").notNull(),
	descriptionLog: text("descriptionLog").notNull(),
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

export const pendingGithubDeploymentsRelations = relations(
	pendingGithubDeployments,
	({ one }) => ({
		application: one(applications, {
			fields: [pendingGithubDeployments.applicationId],
			references: [applications.applicationId],
		}),
		compose: one(compose, {
			fields: [pendingGithubDeployments.composeId],
			references: [compose.composeId],
		}),
	}),
);
