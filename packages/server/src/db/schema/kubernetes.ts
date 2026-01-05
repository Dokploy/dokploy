/**
 * Kubernetes-specific Database Tables
 *
 * These tables store K8s-specific data that doesn't exist in Docker Swarm:
 * - Custom Resources (CRDs like IngressRoute, Middleware, etc.)
 * - Metrics cache for HPA decisions
 * - Network Policies configuration
 */

import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { server } from "./server";

// =============================================================================
// K8s Custom Resource Table
// =============================================================================

export const k8sResourceKind = pgEnum("k8sResourceKind", [
	"IngressRoute",
	"Middleware",
	"TLSOption",
	"ServersTransport",
	"IngressRouteTCP",
	"IngressRouteUDP",
	"HPA",
	"NetworkPolicy",
	"PodDisruptionBudget",
	"ServiceMonitor",
	"PrometheusRule",
	"Other",
]);

export const k8sCustomResource = pgTable("k8s_custom_resource", {
	resourceId: text("resourceId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	// Reference to application (optional - some resources are cluster-wide)
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{
			onDelete: "cascade",
		},
	),

	// Reference to server
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),

	// Resource identification
	kind: k8sResourceKind("kind").notNull(),
	apiVersion: text("apiVersion").notNull(), // e.g., "traefik.io/v1alpha1"
	name: text("name").notNull(),
	namespace: text("namespace").notNull(),

	// Full manifest storage (YAML/JSON)
	manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),

	// Status tracking
	applied: boolean("applied").default(false),
	lastAppliedAt: timestamp("lastAppliedAt"),
	lastError: text("lastError"),

	// Timestamps
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const k8sCustomResourceRelations = relations(
	k8sCustomResource,
	({ one }) => ({
		application: one(applications, {
			fields: [k8sCustomResource.applicationId],
			references: [applications.applicationId],
		}),
		server: one(server, {
			fields: [k8sCustomResource.serverId],
			references: [server.serverId],
		}),
	}),
);

// =============================================================================
// K8s Metrics Cache Table
// =============================================================================

export const metricType = pgEnum("k8sMetricType", [
	"resource", // CPU, Memory
	"pods", // Custom pod metrics
	"external", // External metrics (Prometheus, etc.)
	"custom", // Custom metrics
]);

export const k8sMetrics = pgTable("k8s_metrics", {
	metricId: text("metricId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	// Reference to application
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, {
			onDelete: "cascade",
		}),

	// Metric definition
	metricName: text("metricName").notNull(), // e.g., "http_requests_per_second"
	metricType: metricType("metricType").notNull(),

	// For Prometheus queries
	query: text("query"), // PromQL query

	// Target values for HPA
	targetValue: text("targetValue"), // e.g., "100" or "80%"
	targetType: text("targetType"), // "Value", "Utilization", "AverageValue"

	// Current cached value
	currentValue: text("currentValue"),
	lastUpdated: timestamp("lastUpdated"),

	// Enabled flag
	enabled: boolean("enabled").default(true),

	// Timestamps
	createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const k8sMetricsRelations = relations(k8sMetrics, ({ one }) => ({
	application: one(applications, {
		fields: [k8sMetrics.applicationId],
		references: [applications.applicationId],
	}),
}));

// =============================================================================
// K8s Network Policy Rules Table
// =============================================================================

export const policyDirection = pgEnum("k8sPolicyDirection", [
	"ingress",
	"egress",
]);

export const k8sNetworkPolicyRule = pgTable("k8s_network_policy_rule", {
	ruleId: text("ruleId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	// Reference to application
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, {
			onDelete: "cascade",
		}),

	// Rule definition
	direction: policyDirection("direction").notNull(),
	priority: integer("priority").default(100),

	// Peer configuration
	peerConfig: jsonb("peerConfig")
		.$type<{
			podSelector?: Record<string, string>;
			namespaceSelector?: Record<string, string>;
			ipBlock?: {
				cidr: string;
				except?: string[];
			};
		}>()
		.notNull(),

	// Port configuration
	ports: jsonb("ports")
		.$type<
			Array<{
				protocol?: "TCP" | "UDP";
				port?: number | string;
			}>
		>()
		.default([]),

	// Description
	description: text("description"),

	// Enabled flag
	enabled: boolean("enabled").default(true),

	// Timestamps
	createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const k8sNetworkPolicyRuleRelations = relations(
	k8sNetworkPolicyRule,
	({ one }) => ({
		application: one(applications, {
			fields: [k8sNetworkPolicyRule.applicationId],
			references: [applications.applicationId],
		}),
	}),
);

// =============================================================================
// K8s Events Log Table
// =============================================================================

export const eventType = pgEnum("k8sEventType", ["Normal", "Warning"]);

export const k8sEventLog = pgTable("k8s_event_log", {
	eventId: text("eventId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	// Reference to application
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{
			onDelete: "cascade",
		},
	),

	// Reference to server
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),

	// Event details
	eventType: eventType("eventType").notNull(),
	reason: text("reason").notNull(),
	message: text("message").notNull(),
	involvedObject: text("involvedObject"), // e.g., "Pod/my-app-abc123"
	source: text("source"), // e.g., "kubelet"

	// Occurrence tracking
	count: integer("count").default(1),
	firstTimestamp: timestamp("firstTimestamp").notNull(),
	lastTimestamp: timestamp("lastTimestamp").notNull(),

	// Namespace
	namespace: text("namespace"),

	// Timestamps
	createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const k8sEventLogRelations = relations(k8sEventLog, ({ one }) => ({
	application: one(applications, {
		fields: [k8sEventLog.applicationId],
		references: [applications.applicationId],
	}),
	server: one(server, {
		fields: [k8sEventLog.serverId],
		references: [server.serverId],
	}),
}));

// =============================================================================
// Zod Schemas for API Validation
// =============================================================================

const createK8sResourceSchema = createInsertSchema(k8sCustomResource, {
	resourceId: z.string().min(1),
	kind: z.enum([
		"IngressRoute",
		"Middleware",
		"TLSOption",
		"ServersTransport",
		"IngressRouteTCP",
		"IngressRouteUDP",
		"HPA",
		"NetworkPolicy",
		"PodDisruptionBudget",
		"ServiceMonitor",
		"PrometheusRule",
		"Other",
	]),
	apiVersion: z.string().min(1),
	name: z.string().min(1),
	namespace: z.string().min(1),
	manifest: z.record(z.unknown()),
});

export const apiCreateK8sCustomResource = createK8sResourceSchema.pick({
	applicationId: true,
	serverId: true,
	kind: true,
	apiVersion: true,
	name: true,
	namespace: true,
	manifest: true,
});

export const apiFindK8sCustomResource = createK8sResourceSchema
	.pick({
		resourceId: true,
	})
	.required();

export const apiDeleteK8sCustomResource = createK8sResourceSchema
	.pick({
		resourceId: true,
	})
	.required();

export const apiListK8sCustomResources = z.object({
	applicationId: z.string().optional(),
	serverId: z.string().optional(),
	kind: z
		.enum([
			"IngressRoute",
			"Middleware",
			"TLSOption",
			"ServersTransport",
			"IngressRouteTCP",
			"IngressRouteUDP",
			"HPA",
			"NetworkPolicy",
			"PodDisruptionBudget",
			"ServiceMonitor",
			"PrometheusRule",
			"Other",
		])
		.optional(),
	namespace: z.string().optional(),
});

// Metrics schemas
const createK8sMetricsSchema = createInsertSchema(k8sMetrics, {
	metricId: z.string().min(1),
	applicationId: z.string().min(1),
	metricName: z.string().min(1),
	metricType: z.enum(["resource", "pods", "external", "custom"]),
	query: z.string().optional(),
	targetValue: z.string().optional(),
	targetType: z.string().optional(),
});

export const apiCreateK8sMetric = createK8sMetricsSchema.pick({
	applicationId: true,
	metricName: true,
	metricType: true,
	query: true,
	targetValue: true,
	targetType: true,
});

export const apiUpdateK8sMetric = createK8sMetricsSchema
	.pick({
		metricId: true,
	})
	.required()
	.extend({
		metricName: z.string().optional(),
		query: z.string().optional(),
		targetValue: z.string().optional(),
		targetType: z.string().optional(),
		enabled: z.boolean().optional(),
	});

// Network Policy Rule schemas
const createNetworkPolicyRuleSchema = createInsertSchema(k8sNetworkPolicyRule, {
	ruleId: z.string().min(1),
	applicationId: z.string().min(1),
	direction: z.enum(["ingress", "egress"]),
	priority: z.number().int().min(0).max(1000).optional(),
	peerConfig: z.object({
		podSelector: z.record(z.string()).optional(),
		namespaceSelector: z.record(z.string()).optional(),
		ipBlock: z
			.object({
				cidr: z.string(),
				except: z.array(z.string()).optional(),
			})
			.optional(),
	}),
	ports: z
		.array(
			z.object({
				protocol: z.enum(["TCP", "UDP"]).optional(),
				port: z.union([z.number(), z.string()]).optional(),
			}),
		)
		.optional(),
	description: z.string().optional(),
});

export const apiCreateNetworkPolicyRule = createNetworkPolicyRuleSchema.pick({
	applicationId: true,
	direction: true,
	priority: true,
	peerConfig: true,
	ports: true,
	description: true,
});

export const apiDeleteNetworkPolicyRule = createNetworkPolicyRuleSchema
	.pick({
		ruleId: true,
	})
	.required();
