import { relations, sql } from "drizzle-orm";
import {
	boolean,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

/**
 * Organization-scoped Cloudflare integration credentials.
 *
 * Stores a scoped API token plus the Cloudflare account it belongs to. Mirrors
 * the `destination`/`registry` convention of keeping secrets as plaintext text
 * columns; access is gated to org admins/owners at the router layer.
 */
export const cloudflare = pgTable("cloudflare", {
	cloudflareId: text("cloudflareId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	apiToken: text("apiToken").notNull(),
	accountId: text("accountId").notNull(),
	defaultTunnelId: text("defaultTunnelId"),
	// --- Org-level Cloudflare Access defaults & policy (admin-configured) ---
	// Default Access session lifetime applied to newly protected domains, in
	// Cloudflare duration syntax ("168h" = 1 week).
	defaultSessionDuration: text("defaultSessionDuration")
		.notNull()
		.default("168h"),
	// When true, new domains are auto-published via Tunnel and gated with Access
	// using the org defaults below.
	protectDomainsByDefault: boolean("protectDomainsByDefault")
		.notNull()
		.default(false),
	// When true, members may only create protected (Tunnel + Access) domains;
	// owners/admins may still create an unprotected one.
	requireProtectedDomains: boolean("requireProtectedDomains")
		.notNull()
		.default(false),
	// Default Access allow-list used when a protected domain specifies none of
	// its own identities.
	defaultAllowEmails: text("defaultAllowEmails")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	defaultAllowEmailDomains: text("defaultAllowEmailDomains")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const cloudflareRelations = relations(cloudflare, ({ one, many }) => ({
	organization: one(organization, {
		fields: [cloudflare.organizationId],
		references: [organization.id],
	}),
	tunnelRuntimes: many(cloudflareTunnelRuntime),
}));

/** Only `shared-managed` connectors are deployed by Dokploy today. */
export const cloudflareTunnelRuntimeMode = pgEnum(
	"cloudflareTunnelRuntimeMode",
	["shared-managed"],
);

export const cloudflareTunnelRuntimeStatus = pgEnum(
	"cloudflareTunnelRuntimeStatus",
	["pending", "running", "error", "stopped"],
);

/**
 * Tracks a Dokploy-managed `cloudflared` connector for a (organization, server,
 * integration) tuple. `serverId` is null for the Dokploy host. The unique index
 * plus the deterministic `dockerResourceName` keep a single connector per tuple
 * even under concurrent publishes.
 */
export const cloudflareTunnelRuntime = pgTable(
	"cloudflare_tunnel_runtime",
	{
		id: text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		cloudflareId: text("cloudflareId")
			.notNull()
			.references(() => cloudflare.cloudflareId, { onDelete: "cascade" }),
		// Server the connector runs on; null = Dokploy host. Kept as plain text
		// (no FK) so the runtime survives independent reconciliation.
		serverId: text("serverId"),
		tunnelId: text("tunnelId").notNull(),
		tunnelName: text("tunnelName").notNull(),
		dockerResourceName: text("dockerResourceName").notNull(),
		runtimeMode: cloudflareTunnelRuntimeMode("runtimeMode")
			.notNull()
			.default("shared-managed"),
		status: cloudflareTunnelRuntimeStatus("status")
			.notNull()
			.default("pending"),
		lastError: text("lastError"),
		lastStartedAt: timestamp("lastStartedAt"),
		lastSeenAt: timestamp("lastSeenAt"),
		createdAt: timestamp("createdAt").notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("cloudflare_tunnel_runtime_org_server_cf_unique").on(
			table.organizationId,
			table.serverId,
			table.cloudflareId,
		),
	],
);

export const cloudflareTunnelRuntimeRelations = relations(
	cloudflareTunnelRuntime,
	({ one }) => ({
		organization: one(organization, {
			fields: [cloudflareTunnelRuntime.organizationId],
			references: [organization.id],
		}),
		cloudflare: one(cloudflare, {
			fields: [cloudflareTunnelRuntime.cloudflareId],
			references: [cloudflare.cloudflareId],
		}),
	}),
);

/** Cloudflare Access session duration syntax: "0" or number+unit segments. */
export const cloudflareSessionDurationSchema = z
	.string()
	.regex(/^(0|(\d+(ms|s|m|h))+)$/, "Use a duration like 24h, 168h, or 0");

const createSchema = createInsertSchema(cloudflare, {
	name: z.string().min(1),
	// Trim before validating so a whitespace-only token can't pass `.min(1)`
	// (and, on update, silently overwrite a working token with blanks).
	apiToken: z.string().trim().min(1),
	accountId: z.string().trim().min(1),
	// `nullish` so the optional default can be both omitted (create) and
	// explicitly cleared with `null` (update sets the column back to NULL).
	defaultTunnelId: z.string().nullish(),
	defaultSessionDuration: cloudflareSessionDurationSchema.default("168h"),
	// Trim identities so whitespace-only entries can't create junk Access rules.
	defaultAllowEmails: z.array(z.string().trim().email()).default([]),
	defaultAllowEmailDomains: z.array(z.string().trim().min(1)).default([]),
});

export const apiCreateCloudflare = createSchema.pick({
	name: true,
	apiToken: true,
	accountId: true,
	defaultTunnelId: true,
});

export const apiFindOneCloudflare = z.object({
	cloudflareId: z.string().min(1),
});

export const apiRemoveCloudflare = z.object({
	cloudflareId: z.string().min(1),
});

export const apiUpdateCloudflare = createSchema
	.pick({
		name: true,
		accountId: true,
		defaultTunnelId: true,
		protectDomainsByDefault: true,
		requireProtectedDomains: true,
	})
	.extend({
		cloudflareId: z.string().min(1),
		// Token is write-only on update: omit it to keep the stored value.
		apiToken: z.string().trim().min(1).optional(),
		// Optional WITHOUT a default: these carry a `.default()` in createSchema, so
		// picking them would re-apply the default on a partial update and silently
		// reset the stored value (and could trip the lockout guard on an unrelated
		// edit). Omitting a field here leaves the stored value untouched.
		defaultSessionDuration: cloudflareSessionDurationSchema.optional(),
		defaultAllowEmails: z.array(z.string().trim().email()).optional(),
		defaultAllowEmailDomains: z.array(z.string().trim().min(1)).optional(),
	});

export const apiTestCloudflareConnection = z
	.object({
		// Either a freshly-typed token (create flow) or an existing integration to
		// test with its stored token (edit flow — the token is write-only and never
		// sent back to the client). The account id is always validated against
		// whichever token is used, so a corrected id can be tested without re-entry.
		cloudflareId: z.string().min(1).optional(),
		apiToken: z.string().trim().min(1).optional(),
		accountId: z.string().trim().min(1),
	})
	.refine((data) => !!data.apiToken || !!data.cloudflareId, {
		message: "Provide an API token or an existing integration to test",
		path: ["apiToken"],
	});
