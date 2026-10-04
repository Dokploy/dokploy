import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { domains } from "./domain";

export const DODOMAIN_DEFAULT_BASE_URL = "https://app.dodomain.io";

/** One DNS record a connect session asks the end user to create. */
export interface DoDomainRecord {
	type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
	/** Relative to the session domain; "@" is the domain itself. */
	host: string;
	value: string;
	priority?: number;
	ttl?: number;
}

/**
 * Organization-scoped DoDomain connection (one per organization).
 *
 * The app secret key (`dd_sk_…`) and the webhook signing secret (`whsec_…`)
 * are stored as plaintext text columns, like `cloudflare.apiToken`; both are
 * write-only from the dashboard's perspective and every read path strips them.
 * Access is gated to org admins/owners at the router.
 */
export const dodomainIntegration = pgTable("dodomain_integration", {
	dodomainId: text("dodomainId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationId: text("organizationId")
		.notNull()
		.unique()
		.references(() => organization.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	secretKey: text("secretKey").notNull(),
	appId: text("appId").notNull(),
	baseUrl: text("baseUrl").notNull().default(DODOMAIN_DEFAULT_BASE_URL),
	/** The endpoint DoDomain delivers this app's webhooks to. */
	webhookEndpointId: text("webhookEndpointId"),
	/** The URL that endpoint was registered with (shown on the settings card). */
	webhookUrl: text("webhookUrl"),
	/** Show-once signing secret returned when the endpoint was created. */
	webhookSecret: text("webhookSecret"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/**
 * Webhook delivery ledger. DoDomain retries one delivery up to 8 times with
 * the same id; a row here means the delivery was already applied.
 */
export const dodomainWebhookDelivery = pgTable("dodomain_webhook_delivery", {
	deliveryId: text("deliveryId").notNull().primaryKey(),
	receivedAt: timestamp("receivedAt").notNull().defaultNow(),
});

/**
 * The connect session most recently created for a domain. Kept out of the
 * upstream-owned `domain` table so only the ids and the verification status
 * live there; the connect URL and the requested records live here.
 */
export const dodomainConnectSession = pgTable("dodomain_connect_session", {
	sessionId: text("sessionId").notNull().primaryKey(),
	domainId: text("domainId")
		.notNull()
		.references(() => domains.domainId, { onDelete: "cascade" }),
	dodomainId: text("dodomainId")
		.notNull()
		.references(() => dodomainIntegration.dodomainId, { onDelete: "cascade" }),
	connectUrl: text("connectUrl").notNull(),
	records: jsonb("records").$type<DoDomainRecord[]>().notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const dodomainIntegrationRelations = relations(
	dodomainIntegration,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [dodomainIntegration.organizationId],
			references: [organization.id],
		}),
		sessions: many(dodomainConnectSession),
	}),
);

export const dodomainConnectSessionRelations = relations(
	dodomainConnectSession,
	({ one }) => ({
		integration: one(dodomainIntegration, {
			fields: [dodomainConnectSession.dodomainId],
			references: [dodomainIntegration.dodomainId],
		}),
		domain: one(domains, {
			fields: [dodomainConnectSession.domainId],
			references: [domains.domainId],
		}),
	}),
);

// The DoDomain SDK refuses any key without this prefix before sending it.
const dodomainSecretKeySchema = z
	.string()
	.trim()
	.startsWith("dd_sk_", "A DoDomain secret key starts with dd_sk_");

// The secret key travels as a bearer token, so plain http would leak it. Only
// loopback hosts may skip TLS, for local development.
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isSecureDoDomainBaseUrl = (value: string) => {
	try {
		const url = new URL(value);
		if (url.protocol === "https:") return true;
		return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
	} catch {
		return false;
	}
};

const dodomainBaseUrlSchema = z
	.string()
	.trim()
	.url("Enter a valid URL")
	.refine(
		isSecureDoDomainBaseUrl,
		"Use an https URL (http is only allowed for localhost)",
	)
	.transform((value) => value.replace(/\/+$/, ""));

export const apiCreateDoDomain = z.object({
	name: z.string().trim().min(1),
	secretKey: dodomainSecretKeySchema,
	appId: z.string().trim().min(1),
	baseUrl: dodomainBaseUrlSchema.default(DODOMAIN_DEFAULT_BASE_URL),
});

export const apiUpdateDoDomain = z.object({
	name: z.string().trim().min(1).optional(),
	// Write-only: omit it to keep the stored key.
	secretKey: dodomainSecretKeySchema.optional(),
	appId: z.string().trim().min(1).optional(),
	baseUrl: dodomainBaseUrlSchema.optional(),
});

export const apiTestDoDomainConnection = z.object({
	// Blank on the edit flow: the stored key of the caller's integration is used.
	secretKey: dodomainSecretKeySchema.optional(),
	appId: z.string().trim().min(1).optional(),
	baseUrl: dodomainBaseUrlSchema.default(DODOMAIN_DEFAULT_BASE_URL),
});

export const apiDoDomainCheckHost = z.object({
	host: z.string().trim().min(1).max(253),
});

export const apiDoDomainDomain = z.object({
	domainId: z.string().min(1),
});
