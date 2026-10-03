import { relations } from "drizzle-orm";
import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const UPTIMELY_DEFAULT_BASE_URL = "https://app.getuptimely.com";

export const UPTIMELY_SERVICE_TYPES = [
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
] as const;

export const UPTIMELY_MONITOR_KINDS = [
	"website",
	"port",
	"ssl",
	"domain",
] as const;

export const uptimelyServiceType = pgEnum(
	"uptimelyServiceType",
	UPTIMELY_SERVICE_TYPES,
);

export const uptimelyMonitorKind = pgEnum(
	"uptimelyMonitorKind",
	UPTIMELY_MONITOR_KINDS,
);

export type UptimelyServiceType = (typeof UPTIMELY_SERVICE_TYPES)[number];
export type UptimelyMonitorKind = (typeof UPTIMELY_MONITOR_KINDS)[number];

/**
 * Organization-scoped Uptimely connection (one per organization).
 *
 * The project API key is stored as a plaintext text column, like
 * `cloudflare.apiToken`; it is write-only from the dashboard's perspective and
 * every read path masks it. Access is gated to org admins/owners at the router.
 */
export const uptimelyIntegration = pgTable("uptimely_integration", {
	uptimelyId: text("uptimelyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationId: text("organizationId")
		.notNull()
		.unique()
		.references(() => organization.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	apiKey: text("apiKey").notNull(),
	projectId: text("projectId").notNull(),
	baseUrl: text("baseUrl").notNull().default(UPTIMELY_DEFAULT_BASE_URL),
	statusPageSlug: text("statusPageSlug"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/**
 * One row per Uptimely monitor created for a Dokploy service. `serviceId` is
 * the id of the row in the table named by `serviceType` (applicationId,
 * composeId, postgresId, ...); it is intentionally not a foreign key because it
 * points at one of seven tables.
 */
export const uptimelyMonitorLink = pgTable(
	"uptimely_monitor_link",
	{
		linkId: text("linkId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		uptimelyId: text("uptimelyId")
			.notNull()
			.references(() => uptimelyIntegration.uptimelyId, {
				onDelete: "cascade",
			}),
		serviceType: uptimelyServiceType("serviceType").notNull(),
		serviceId: text("serviceId").notNull(),
		monitorId: text("monitorId").notNull(),
		kind: uptimelyMonitorKind("kind").notNull(),
		target: text("target").notNull(),
		createdAt: timestamp("createdAt").notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("uptimely_monitor_link_service_monitor_unique").on(
			table.serviceType,
			table.serviceId,
			table.monitorId,
		),
	],
);

export const uptimelyIntegrationRelations = relations(
	uptimelyIntegration,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [uptimelyIntegration.organizationId],
			references: [organization.id],
		}),
		links: many(uptimelyMonitorLink),
	}),
);

export const uptimelyMonitorLinkRelations = relations(
	uptimelyMonitorLink,
	({ one }) => ({
		integration: one(uptimelyIntegration, {
			fields: [uptimelyMonitorLink.uptimelyId],
			references: [uptimelyIntegration.uptimelyId],
		}),
	}),
);

// Uptimely validates project ids as UUIDs on every tool call.
const uptimelyProjectIdSchema = z
	.string()
	.trim()
	.uuid("The Uptimely project id is a UUID");

const uptimelyBaseUrlSchema = z
	.string()
	.trim()
	.url("Enter a valid URL")
	.refine((value) => /^https?:\/\//i.test(value), "Use an http(s) URL")
	.transform((value) => value.replace(/\/+$/, ""));

// Slugs appear in a URL path; keep them to the shape Uptimely generates.
const uptimelyStatusPageSlugSchema = z
	.string()
	.trim()
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "Use the status page slug only")
	.max(200);

export const apiCreateUptimely = z.object({
	name: z.string().trim().min(1),
	// Trim before validating so a whitespace-only key cannot pass `.min(1)`.
	apiKey: z.string().trim().min(1),
	projectId: uptimelyProjectIdSchema,
	baseUrl: uptimelyBaseUrlSchema.default(UPTIMELY_DEFAULT_BASE_URL),
	statusPageSlug: uptimelyStatusPageSlugSchema.nullish(),
});

export const apiUpdateUptimely = z.object({
	name: z.string().trim().min(1).optional(),
	// Write-only: omit it to keep the stored key.
	apiKey: z.string().trim().min(1).optional(),
	projectId: uptimelyProjectIdSchema.optional(),
	baseUrl: uptimelyBaseUrlSchema.optional(),
	// `null` clears the slug; omitting it leaves the stored value untouched.
	statusPageSlug: uptimelyStatusPageSlugSchema.nullish(),
});

export const apiTestUptimelyConnection = z.object({
	// Blank on the edit flow: the stored key of the caller's integration is used.
	apiKey: z.string().trim().min(1).optional(),
	// Optional so the test can be used to discover the project id.
	projectId: uptimelyProjectIdSchema.optional(),
	baseUrl: uptimelyBaseUrlSchema.default(UPTIMELY_DEFAULT_BASE_URL),
});

export const apiUptimelyService = z.object({
	serviceType: z.enum(UPTIMELY_SERVICE_TYPES),
	serviceId: z.string().min(1),
});

export const UPTIMELY_CHECK_PATH_MAX_LENGTH = 200;

/**
 * Optional path every Website monitor checks (e.g. `/health`), appended to the
 * domain's own path. It is only ever joined onto the service's own hosts, so
 * it must stay a plain path: it starts with a single `/`, is printable ASCII
 * and contains no whitespace, backslash (browsers read it as `/`) or fragment.
 * `//host` would be a protocol-relative URL and is refused outright.
 */
export const uptimelyCheckPathSchema = z
	.string()
	.max(
		UPTIMELY_CHECK_PATH_MAX_LENGTH,
		`Use at most ${UPTIMELY_CHECK_PATH_MAX_LENGTH} characters`,
	)
	.refine((value) => value.startsWith("/"), "The path must start with /")
	.refine((value) => !value.startsWith("//"), "The path cannot start with //")
	.refine(
		(value) => /^[\x21-\x7e]*$/.test(value) && !/[\\#]/.test(value),
		"Use a plain path without spaces, backslashes or #",
	);

export const apiLinkUptimelyService = apiUptimelyService.extend({
	includeSslAndDomain: z.boolean().default(false),
	checkPath: uptimelyCheckPathSchema.optional(),
});

export const apiPreflightUptimelyService = apiUptimelyService.extend({
	checkPath: uptimelyCheckPathSchema.optional(),
});

export const apiRunUptimelyProbe = apiUptimelyService.extend({
	// Probe one linked monitor; omit to probe every monitor of the service.
	linkId: z.string().min(1).optional(),
});
