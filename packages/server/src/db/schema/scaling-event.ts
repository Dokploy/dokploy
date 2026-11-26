import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { MAX_SERVICE_REPLICAS } from "./shared";
import { user } from "./user";

export const scalingEventSource = pgEnum("scalingEventSource", [
	"manual",
	"autoscaler",
	"deploy",
	"system",
]);

export const scalingEventAction = pgEnum("scalingEventAction", [
	"scale_up",
	"scale_down",
	"set",
	"hold",
	"blocked",
	"error",
	"policy_change",
]);

export const scalingEvents = pgTable(
	"scaling_event",
	{
		scalingEventId: text("scalingEventId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		applicationId: text("applicationId").references(
			() => applications.applicationId,
			{ onDelete: "cascade" },
		),
		composeId: text("composeId").references(() => compose.composeId, {
			onDelete: "cascade",
		}),
		serviceName: text("serviceName"),
		source: scalingEventSource("source").notNull(),
		action: scalingEventAction("action").notNull(),
		fromReplicas: integer("fromReplicas"),
		toReplicas: integer("toReplicas"),
		reason: text("reason"),
		details: jsonb("details").$type<Record<string, unknown>>(),
		userId: text("userId").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
	},
	(t) => ({
		applicationCreatedAtIdx: index(
			"scalingEvent_applicationId_createdAt_idx",
		).on(t.applicationId, t.createdAt),
		composeCreatedAtIdx: index("scalingEvent_composeId_createdAt_idx").on(
			t.composeId,
			t.createdAt,
		),
		singleOwner: check(
			"scaling_event_single_owner",
			sql`(${t.applicationId} IS NOT NULL AND ${t.composeId} IS NULL AND ${t.serviceName} IS NULL) OR (${t.applicationId} IS NULL AND ${t.composeId} IS NOT NULL AND ${t.serviceName} IS NOT NULL)`,
		),
	}),
);

export const scalingEventsRelations = relations(scalingEvents, ({ one }) => ({
	application: one(applications, {
		fields: [scalingEvents.applicationId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [scalingEvents.composeId],
		references: [compose.composeId],
	}),
	user: one(user, {
		fields: [scalingEvents.userId],
		references: [user.id],
	}),
}));

export type ScalingEvent = typeof scalingEvents.$inferSelect;

export const apiFindScalingStatus = z.object({
	applicationId: z.string().min(1),
});

export const apiSetReplicas = z.object({
	applicationId: z.string().min(1),
	replicas: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
	acknowledgeWarnings: z.boolean().optional(),
});

export const apiFindScalingMetrics = z.object({
	applicationId: z.string().min(1),
	rangeMinutes: z.number().int().min(5).max(360).default(60),
});

export const apiFindCapacity = z.object({
	applicationId: z.string().min(1),
	replicas: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
});

export const apiUpdateRollout = z.object({
	applicationId: z.string().min(1),
	strategy: z.enum(["start-first", "stop-first"]),
	batchSize: z.number().int().min(0).max(MAX_SERVICE_REPLICAS),
	delaySeconds: z.number().int().min(0).max(3600),
	monitorSeconds: z.number().int().min(1).max(3600),
	failureAction: z.enum(["rollback", "pause", "continue"]),
	maxFailureRatioPercent: z.number().int().min(0).max(100),
});

export const poolName = z
	.string()
	.regex(
		/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/,
		"Use letters, digits, dots and dashes",
	);

const placementSelection = z.object({
	nodeTarget: z.enum(["any", "managers", "workers", "node", "nodes", "pool"]),
	hostname: z
		.string()
		.regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/, "Invalid node hostname")
		.nullable(),
	pool: poolName.nullable().default(null),
	nodeIds: z
		.array(z.string().regex(/^[A-Za-z0-9]{1,64}$/, "Invalid node ID"))
		.max(MAX_SERVICE_REPLICAS)
		.default([]),
	maxReplicasPerNode: z.number().int().min(0).max(MAX_SERVICE_REPLICAS),
});

const targetIsComplete = (input: {
	nodeTarget: string;
	hostname: string | null;
	pool: string | null;
	nodeIds: string[];
}) =>
	(input.nodeTarget !== "node" || !!input.hostname) &&
	(input.nodeTarget !== "pool" || !!input.pool) &&
	(input.nodeTarget !== "nodes" || input.nodeIds.length > 0);

export const apiUpdatePlacement = placementSelection
	.extend({ applicationId: z.string().min(1) })
	.refine(targetIsComplete, {
		message: "Select a node, nodes or a pool",
		path: ["nodeTarget"],
	});

export const apiFindScalingEvents = z.object({
	applicationId: z.string().min(1),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

// Compose service names are interpolated into docker commands; this is the
// character set Compose itself accepts for service names.
export const composeServiceName = z
	.string()
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/, "Invalid service name");

export const apiFindComposeScaling = z.object({
	composeId: z.string().min(1),
});

export const apiFindComposeScalingMetrics = z.object({
	composeId: z.string().min(1),
	serviceName: composeServiceName,
	rangeMinutes: z.number().int().min(5).max(360).default(60),
});

export const apiSetComposeReplicas = z.object({
	composeId: z.string().min(1),
	serviceName: composeServiceName,
	replicas: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
	acknowledgeWarnings: z.boolean().optional(),
});

export const apiFindComposeCapacity = z.object({
	composeId: z.string().min(1),
	serviceName: composeServiceName,
	replicas: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
});

export const apiFindComposeServiceSettings = z.object({
	composeId: z.string().min(1),
	serviceName: composeServiceName,
});

export const apiUpdateComposePlacement = placementSelection
	.extend({ composeId: z.string().min(1), serviceName: composeServiceName })
	.refine(targetIsComplete, {
		message: "Select a node, nodes or a pool",
		path: ["nodeTarget"],
	});

export const apiSwitchComposeToStack = z.object({
	composeId: z.string().min(1),
	acknowledgeWarnings: z.boolean().default(false),
});

export const apiFindComposeScalingEvents = z.object({
	composeId: z.string().min(1),
	serviceName: composeServiceName.optional(),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});
