import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { organization } from "./account";
import { deploymentStatus } from "./deployment";

export const restorations = pgTable(
	"restoration",
	{
		restorationId: text("restorationId")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organizationId").references(() => organization.id, {
			onDelete: "cascade",
		}),
		kind: text("kind").$type<"database" | "volume" | "dokploy">().notNull(),
		serviceId: text("serviceId").notNull(),
		serviceType: text("serviceType").notNull(),
		serviceName: text("serviceName").notNull(),
		serviceHref: text("serviceHref"),
		targetName: text("targetName").notNull(),
		backupFile: text("backupFile").notNull(),
		destinationName: text("destinationName").notNull(),
		status: deploymentStatus("status").notNull().default("running"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		heartbeatAt: timestamp("heartbeatAt", {
			mode: "string",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		finishedAt: text("finishedAt"),
		errorMessage: text("errorMessage"),
	},
	(table) => [
		index("restoration_organization_created_idx").on(
			table.organizationId,
			table.createdAt,
		),
		uniqueIndex("restoration_running_target_idx")
			.on(
				sql`coalesce(${table.organizationId}, '')`,
				table.kind,
				table.serviceId,
				table.targetName,
			)
			.where(sql`${table.status} = 'running'`),
	],
);

export type Restoration = typeof restorations.$inferSelect;
