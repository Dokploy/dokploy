import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { cloudflare, cloudflareSessionDurationSchema } from "./cloudflare";
import { domains } from "./domain";

/**
 * A Cloudflare Access (Zero Trust) self-hosted application protecting a single
 * published domain, plus its allow policy. One row per domain (1:1). Tracks the
 * Cloudflare-side app/policy IDs so they can be cleaned up.
 */
export const cloudflareAccessApplication = pgTable(
	"cloudflare_access_application",
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
		domainId: text("domainId")
			.notNull()
			.references(() => domains.domainId, { onDelete: "cascade" }),
		cloudflareAppId: text("cloudflareAppId").notNull(),
		cloudflarePolicyId: text("cloudflarePolicyId"),
		appDomain: text("appDomain").notNull(),
		sessionDuration: text("sessionDuration").notNull().default("24h"),
		allowEmails: text("allowEmails")
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),
		allowEmailDomains: text("allowEmailDomains")
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),
		createdAt: timestamp("createdAt").notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("cloudflare_access_application_domainId_unique").on(
			table.domainId,
		),
	],
);

export const cloudflareAccessApplicationRelations = relations(
	cloudflareAccessApplication,
	({ one }) => ({
		organization: one(organization, {
			fields: [cloudflareAccessApplication.organizationId],
			references: [organization.id],
		}),
		cloudflare: one(cloudflare, {
			fields: [cloudflareAccessApplication.cloudflareId],
			references: [cloudflare.cloudflareId],
		}),
		domain: one(domains, {
			fields: [cloudflareAccessApplication.domainId],
			references: [domains.domainId],
		}),
	}),
);

export const apiUpsertCloudflareAccess = z.object({
	domainId: z.string().min(1),
	// Cloudflare Access session duration: "0" (no expiry) or a combo of
	// number+unit segments (e.g. "24h", "30m", "1h30m"). Reuses the shared
	// validator so the per-domain upsert and the org-default settings stay in
	// lockstep; rejects other strings up front instead of letting Cloudflare error
	// out mid-provision.
	sessionDuration: cloudflareSessionDurationSchema.default("24h"),
	allowEmails: z.array(z.string().trim().email()).default([]),
	allowEmailDomains: z.array(z.string().trim().min(1)).default([]),
});

export const apiFindCloudflareAccessByDomain = z.object({
	domainId: z.string().min(1),
});
