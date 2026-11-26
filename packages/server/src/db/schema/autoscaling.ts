import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { composeServiceName } from "./scaling-event";
import { MAX_SERVICE_REPLICAS } from "./shared";

export interface AutoscalingRecommendation {
	at: string;
	replicas: number;
}

export type AutoscalingAction = "scale_up" | "scale_down" | "hold" | "error";

export interface AutoscalingDecision {
	at: string;
	action: AutoscalingAction;
	reason: string;
	/** Replicas running when the decision was made. */
	current: number | null;
	/** What the metrics ask for, within min and max, before windows and steps. */
	recommended: number | null;
	/** The count the decision applied, or would apply once nothing holds it. */
	target: number | null;
	cpuPercent: number | null;
	memoryPercent: number | null;
	coverage: { ready: number; fresh: number } | null;
}

/** Written only by the controller. */
export interface AutoscalingState {
	recommendations: AutoscalingRecommendation[];
	lastDecision: AutoscalingDecision | null;
	/**
	 * What the last recorded hold or error was about, so a problem that lasts
	 * is recorded once rather than on every evaluation.
	 */
	lastEventKey: string | null;
}

/**
 * How one application, or one service of a compose, is scaled automatically.
 * Users edit the settings; the controller writes `state` and the timestamps.
 */
export const autoscalingPolicies = pgTable(
	"autoscaling_policy",
	{
		autoscalingPolicyId: text("autoscalingPolicyId")
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
		enabled: boolean("enabled").notNull().default(false),
		minReplicas: integer("minReplicas").notNull().default(1),
		maxReplicas: integer("maxReplicas").notNull().default(3),
		cpuTargetPercent: integer("cpuTargetPercent"),
		memoryTargetPercent: integer("memoryTargetPercent"),
		tolerancePercent: integer("tolerancePercent").notNull().default(10),
		evaluationIntervalSeconds: integer("evaluationIntervalSeconds")
			.notNull()
			.default(30),
		scaleUpWindowSeconds: integer("scaleUpWindowSeconds").notNull().default(60),
		scaleDownWindowSeconds: integer("scaleDownWindowSeconds")
			.notNull()
			.default(300),
		cooldownSeconds: integer("cooldownSeconds").notNull().default(60),
		maxScaleUpStep: integer("maxScaleUpStep").notNull().default(4),
		maxScaleDownStep: integer("maxScaleDownStep").notNull().default(1),
		state: jsonb("state").$type<AutoscalingState>(),
		lastEvaluatedAt: timestamp("lastEvaluatedAt"),
		lastScaledAt: timestamp("lastScaledAt"),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt").defaultNow().notNull(),
	},
	(t) => ({
		application: uniqueIndex("autoscaling_policy_application_idx").on(
			t.applicationId,
		),
		composeService: uniqueIndex("autoscaling_policy_compose_service_idx").on(
			t.composeId,
			t.serviceName,
		),
		singleOwner: check(
			"autoscaling_policy_single_owner",
			sql`(${t.applicationId} IS NOT NULL AND ${t.composeId} IS NULL AND ${t.serviceName} IS NULL) OR (${t.applicationId} IS NULL AND ${t.composeId} IS NOT NULL AND ${t.serviceName} IS NOT NULL)`,
		),
		replicaRange: check(
			"autoscaling_policy_replica_range",
			sql`${t.minReplicas} >= 1 AND ${t.maxReplicas} <= ${sql.raw(String(MAX_SERVICE_REPLICAS))} AND ${t.minReplicas} <= ${t.maxReplicas}`,
		),
		target: check(
			"autoscaling_policy_target",
			sql`${t.cpuTargetPercent} IS NOT NULL OR ${t.memoryTargetPercent} IS NOT NULL`,
		),
	}),
);

export const autoscalingPoliciesRelations = relations(
	autoscalingPolicies,
	({ one }) => ({
		application: one(applications, {
			fields: [autoscalingPolicies.applicationId],
			references: [applications.applicationId],
		}),
		compose: one(compose, {
			fields: [autoscalingPolicies.composeId],
			references: [compose.composeId],
		}),
	}),
);

export type AutoscalingPolicy = typeof autoscalingPolicies.$inferSelect;

/**
 * The running controller's heartbeat. The Scaling tab reads it to tell a
 * stopped controller from a policy that simply has nothing to do.
 */
export const autoscalerController = pgTable("autoscaler_controller", {
	controllerId: text("controllerId").notNull().primaryKey(),
	instance: text("instance").notNull(),
	version: text("version"),
	startedAt: timestamp("startedAt").notNull(),
	heartbeatAt: timestamp("heartbeatAt").notNull(),
});

export const autoscalingTarget = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("application"),
		applicationId: z.string().min(1),
	}),
	z.object({
		kind: z.literal("compose"),
		composeId: z.string().min(1),
		serviceName: composeServiceName,
	}),
]);

export type AutoscalingTarget = z.infer<typeof autoscalingTarget>;

const seconds = (min: number, max: number) =>
	z.number().int().min(min).max(max);
const targetPercent = z.number().int().min(5).max(100).nullable();

export const autoscalingSettings = z
	.object({
		enabled: z.boolean(),
		minReplicas: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
		maxReplicas: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
		cpuTargetPercent: targetPercent,
		memoryTargetPercent: targetPercent,
		tolerancePercent: z.number().int().min(0).max(50),
		evaluationIntervalSeconds: seconds(15, 600),
		scaleUpWindowSeconds: seconds(0, 3600),
		scaleDownWindowSeconds: seconds(0, 7200),
		cooldownSeconds: seconds(0, 3600),
		maxScaleUpStep: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
		maxScaleDownStep: z.number().int().min(1).max(MAX_SERVICE_REPLICAS),
	})
	.refine((value) => value.minReplicas <= value.maxReplicas, {
		message: "Minimum replicas cannot be above the maximum",
		path: ["minReplicas"],
	})
	.refine(
		(value) =>
			value.cpuTargetPercent !== null || value.memoryTargetPercent !== null,
		{
			message: "Set a CPU or memory target",
			path: ["cpuTargetPercent"],
		},
	);

export type AutoscalingSettings = z.infer<typeof autoscalingSettings>;

export const apiFindAutoscaling = z.object({ target: autoscalingTarget });

export const apiUpdateAutoscaling = z.object({
	target: autoscalingTarget,
	settings: autoscalingSettings,
});
