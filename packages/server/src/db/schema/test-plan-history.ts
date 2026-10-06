import {
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { applications } from "./application";

// Every test plan the QC service produced for an application, one row per
// version, so an earlier plan can be read again after it has been replaced.
// `applications.testPlanContent` only ever holds the latest.
export const testPlanHistory = pgTable(
	"test_plan_history",
	{
		testPlanHistoryId: text("testPlanHistoryId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		applicationId: text("applicationId")
			.notNull()
			.references(() => applications.applicationId, { onDelete: "cascade" }),
		// Plan versions count per (repo, branch), so the branch is part of the key.
		branch: text("branch").notNull(),
		version: integer("version").notNull(),
		// Null for plans that predate the history and for sources that don't say.
		commitSha: text("commitSha"),
		qcRunId: text("qcRunId"),
		content: text("content").notNull(),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [
		uniqueIndex("test_plan_history_version_idx").on(
			table.applicationId,
			table.branch,
			table.version,
		),
		index("test_plan_history_application_idx").on(
			table.applicationId,
			table.createdAt,
		),
	],
);

export type TestPlanHistory = typeof testPlanHistory.$inferSelect;
