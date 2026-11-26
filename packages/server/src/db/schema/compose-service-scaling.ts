import { relations, sql } from "drizzle-orm";
import {
	check,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { compose } from "./compose";

export interface ComposeServicePlacement {
	nodeTarget: "any" | "managers" | "workers" | "node" | "nodes" | "pool";
	hostname: string | null;
	pool: string | null;
	/** For "nodes": the node label marking the chosen nodes. */
	selectionLabel?: string | null;
	maxReplicasPerNode: number;
}

/**
 * Replica counts and placement set from Dokploy for individual services of a
 * compose deployment. They override the compose file and are written into it
 * on every deploy, so a redeploy keeps them. Either may be unset.
 */
export const composeServiceScaling = pgTable(
	"compose_service_scaling",
	{
		composeId: text("composeId")
			.notNull()
			.references(() => compose.composeId, { onDelete: "cascade" }),
		serviceName: text("serviceName").notNull(),
		replicas: integer("replicas"),
		placement: jsonb("placement").$type<ComposeServicePlacement>(),
		updatedAt: timestamp("updatedAt").defaultNow().notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.composeId, t.serviceName] }),
		replicasRange: check(
			"compose_service_scaling_replicas_range",
			sql`${t.replicas} IS NULL OR (${t.replicas} >= 1 AND ${t.replicas} <= 100)`,
		),
	}),
);

export const composeServiceScalingRelations = relations(
	composeServiceScaling,
	({ one }) => ({
		compose: one(compose, {
			fields: [composeServiceScaling.composeId],
			references: [compose.composeId],
		}),
	}),
);

export type ComposeServiceScaling = typeof composeServiceScaling.$inferSelect;
