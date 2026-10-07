import { isIPv6 } from "node:net";
import { db } from "@dokploy/server/db";
import {
	type apiCreateDoDomain,
	type apiUpdateDoDomain,
	type DnsVerificationStatus,
	type DoDomainRecord,
	dodomainConnectSession,
	dodomainIntegration,
	dodomainWebhookDelivery,
	domains,
} from "@dokploy/server/db/schema";
import {
	createDoDomainClient,
	type DoDomainClient,
	DoDomainError,
	verifyDoDomainSignature,
} from "@dokploy/server/utils/dodomain/client";
import {
	type DoDomainWebhookRefusalReason,
	dodomainWebhookWarning,
	isLikelyPrivateWebhookHost,
	parseDoDomainWebhookRefusal,
} from "@dokploy/server/utils/dodomain/webhook-reachability";
import { getRemotePublicIp, isPrivateIp } from "@dokploy/server/utils/ip";
import { sendDomainVerificationFailedNotifications } from "@dokploy/server/utils/notifications/domain-verification";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";
import { TRPCError } from "@trpc/server";
import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	notExists,
	or,
	sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { getDokployUrl } from "./admin";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";
import {
	type Domain,
	findDomainById,
	resolveGeneratedDomainBase,
	updateDomainById,
} from "./domain";
import { resolveMcpOrigin } from "./mcp-oauth";
import { getWebServerSettings } from "./web-server-settings";

export type DoDomainIntegration = typeof dodomainIntegration.$inferSelect;
export type DoDomainConnectSession = typeof dodomainConnectSession.$inferSelect;

export const DODOMAIN_WEBHOOK_PATH = "/api/webhooks/dodomain";
/** Raw webhook bodies above this are refused before verification. */
export const DODOMAIN_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

export const dodomainClientFor = (
	integration: Pick<DoDomainIntegration, "secretKey" | "baseUrl">,
): DoDomainClient =>
	createDoDomainClient({
		secretKey: integration.secretKey,
		baseUrl: integration.baseUrl,
	});

/** Masks a stored secret key down to its last four characters. */
export const maskDoDomainSecretKey = (secretKey: string) =>
	secretKey.length > 10 ? `dd_sk_••••${secretKey.slice(-4)}` : "dd_sk_••••";

/** Converts a client/service error into a tRPC BAD_REQUEST. */
const asBadRequest = (error: unknown, fallback: string): never => {
	if (error instanceof TRPCError) throw error;
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: error instanceof Error ? error.message : fallback,
		cause: error,
	});
};

// ---------------------------------------------------------------------------
// Webhook URL
// ---------------------------------------------------------------------------

/**
 * The public URL DoDomain delivers this integration's webhooks to. Uses the
 * same deterministic public origin as the MCP discovery documents
 * (`BETTER_AUTH_URL`, else the configured panel host over https); never the
 * request's Host header. DoDomain only delivers to https URLs.
 */
export const resolveDoDomainWebhookUrl = async (dodomainId: string) => {
	const origin = await resolveMcpOrigin({});
	if (!origin) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"DoDomain needs a public URL to send webhooks to. Set the panel domain under Settings → Web Server (or set BETTER_AUTH_URL), then connect again.",
		});
	}
	if (!origin.startsWith("https://")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `DoDomain only delivers webhooks over https, but this panel's public URL is ${origin}. Serve the panel over https first.`,
		});
	}
	return `${origin}${DODOMAIN_WEBHOOK_PATH}?integration=${encodeURIComponent(dodomainId)}`;
};

// ---------------------------------------------------------------------------
// Integration CRUD (one row per organization)
// ---------------------------------------------------------------------------

export const findDoDomainByOrganizationId = async (organizationId: string) => {
	const result = await db.query.dodomainIntegration.findFirst({
		where: eq(dodomainIntegration.organizationId, organizationId),
	});
	return result ?? null;
};

type WebhookRegistration =
	| {
			webhook: {
				webhookEndpointId: string;
				webhookUrl: string;
				webhookSecret: string;
			};
	  }
	| { refusal: DoDomainWebhookRefusalReason };

const refusalOf = (error: unknown) =>
	error instanceof DoDomainError ? parseDoDomainWebhookRefusal(error) : null;

const refusalWarning = (url: string) =>
	dodomainWebhookWarning(new URL(url).hostname);

/**
 * Whether DoDomain can reach this panel's webhook URL, judged from the host
 * alone (see `isLikelyPrivateWebhookHost`). `warning` is null when the host
 * looks public or the panel URL is not configured yet.
 */
export const getDoDomainWebhookReachability = async () => {
	let origin: string | null = null;
	try {
		origin = await resolveMcpOrigin({});
	} catch {
		origin = null;
	}
	if (!origin) {
		return { host: null, likelyPrivate: false, warning: null };
	}
	const host = new URL(origin).hostname;
	const likelyPrivate = isLikelyPrivateWebhookHost(host);
	return {
		host,
		likelyPrivate,
		warning: likelyPrivate ? dodomainWebhookWarning(host) : null,
	};
};

/**
 * Registers (or re-points) the integration's webhook endpoint and returns the
 * endpoint id, URL and signing secret to store. An existing endpoint is
 * PATCHed, which keeps its secret; when the key moved to another app (or the
 * endpoint is gone), a new endpoint is created. A URL already registered for
 * the app (for example after a previous disconnect) is recovered by rotating
 * its secret, since DoDomain never returns a secret twice.
 */
const registerWebhookEndpoint = async (params: {
	client: DoDomainClient;
	url: string;
	existing?: { webhookEndpointId: string | null; webhookSecret: string | null };
}): Promise<WebhookRegistration> => {
	const { client, url, existing } = params;
	if (existing?.webhookEndpointId && existing.webhookSecret) {
		try {
			const updated = await client.webhookEndpoints.update(
				existing.webhookEndpointId,
				url,
			);
			return {
				webhook: {
					webhookEndpointId: updated.id,
					webhookUrl: updated.url,
					webhookSecret: existing.webhookSecret,
				},
			};
		} catch (error) {
			const refusal = refusalOf(error);
			if (refusal) return { refusal };
			if (!(error instanceof DoDomainError) || error.status !== 404) {
				throw error;
			}
			// The endpoint belongs to another app or was deleted: create one.
		}
	}
	try {
		const created = await client.webhookEndpoints.create(url);
		return {
			webhook: {
				webhookEndpointId: created.id,
				webhookUrl: created.url,
				webhookSecret: created.secret,
			},
		};
	} catch (error) {
		// A refused URL (host resolving to private addresses) is not an error: the
		// integration is still useful (Re-verify DNS works without webhooks).
		const refusal = refusalOf(error);
		if (refusal) return { refusal };
		if (!(error instanceof DoDomainError) || error.status !== 400) {
			throw error;
		}
		const { endpoints } = await client.webhookEndpoints.list();
		const match = endpoints.find((endpoint) => endpoint.url === url);
		if (!match) throw error;
		const rotated = await client.webhookEndpoints.rotateSecret(match.id);
		return {
			webhook: {
				webhookEndpointId: rotated.id,
				webhookUrl: rotated.url,
				webhookSecret: rotated.secret,
			},
		};
	}
};

/** The webhook columns of an integration whose endpoint could not be registered. */
const NO_WEBHOOK = {
	webhookEndpointId: null,
	webhookUrl: null,
	webhookSecret: null,
} as const;

export const createDoDomain = async (
	input: z.infer<typeof apiCreateDoDomain>,
	organizationId: string,
) => {
	const existing = await findDoDomainByOrganizationId(organizationId);
	if (existing) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This organization already has a DoDomain integration. Edit it instead.",
		});
	}
	// The id is minted here so the webhook URL can carry it before the row
	// exists (the endpoint must be registered first: its secret is show-once).
	const dodomainId = nanoid();
	const url = await resolveDoDomainWebhookUrl(dodomainId);
	const client = dodomainClientFor(input);
	const registration = await registerWebhookEndpoint({ client, url }).catch(
		(error) => asBadRequest(error, "Error registering the DoDomain webhook"),
	);
	const webhook = "webhook" in registration ? registration.webhook : null;
	try {
		const created = await db
			.insert(dodomainIntegration)
			.values({
				dodomainId,
				name: input.name,
				secretKey: input.secretKey,
				appId: input.appId,
				baseUrl: input.baseUrl,
				organizationId,
				// Refused webhook URL: the integration is still saved without an
				// endpoint (Re-verify DNS works without webhooks).
				...(webhook ?? NO_WEBHOOK),
			})
			.returning()
			.then((rows) => rows[0]);
		if (!created) throw new Error("Error creating the DoDomain integration");
		return {
			integration: created,
			webhookWarning: "refusal" in registration ? refusalWarning(url) : null,
		};
	} catch (error) {
		// Never leave an endpoint DoDomain would deliver to with no receiver.
		if (webhook) {
			await client.webhookEndpoints
				.delete(webhook.webhookEndpointId)
				.catch(() => {});
		}
		return asBadRequest(error, "Error creating the DoDomain integration");
	}
};

export const updateDoDomain = async (
	organizationId: string,
	input: z.infer<typeof apiUpdateDoDomain>,
) => {
	const current = await findDoDomainByOrganizationId(organizationId);
	if (!current) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DoDomain integration not found",
		});
	}
	const values: Partial<DoDomainIntegration> = {};
	if (input.name !== undefined) values.name = input.name;
	if (input.secretKey !== undefined) values.secretKey = input.secretKey;
	if (input.appId !== undefined) values.appId = input.appId;
	if (input.baseUrl !== undefined) values.baseUrl = input.baseUrl;

	const next = { ...current, ...values };
	const credentialsChanged =
		next.secretKey !== current.secretKey || next.baseUrl !== current.baseUrl;
	const url = await resolveDoDomainWebhookUrl(current.dodomainId);
	let webhookWarning: string | null = null;
	if (
		credentialsChanged ||
		url !== current.webhookUrl ||
		!current.webhookSecret
	) {
		const registration = await registerWebhookEndpoint({
			client: dodomainClientFor(next),
			url,
			// A different key or instance cannot address the old endpoint id.
			existing: credentialsChanged ? undefined : current,
		}).catch((error) =>
			asBadRequest(error, "Error registering the DoDomain webhook"),
		);
		if ("webhook" in registration) {
			Object.assign(values, registration.webhook);
		} else {
			webhookWarning = refusalWarning(url);
			// New credentials cannot address the old endpoint; with the same
			// credentials the old endpoint (if any) is left as it was.
			if (credentialsChanged) Object.assign(values, NO_WEBHOOK);
		}
		if (credentialsChanged && current.webhookEndpointId) {
			await dodomainClientFor(current)
				.webhookEndpoints.delete(current.webhookEndpointId)
				.catch(() => {});
		}
	}

	const updated = await db
		.update(dodomainIntegration)
		.set(values)
		.where(eq(dodomainIntegration.organizationId, organizationId))
		.returning()
		.then((rows) => rows[0]);
	if (!updated) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "DoDomain integration not found",
		});
	}
	return { integration: updated, webhookWarning };
};

export const removeDoDomain = async (organizationId: string) => {
	const removed = await db
		.delete(dodomainIntegration)
		.where(eq(dodomainIntegration.organizationId, organizationId))
		.returning()
		.then((rows) => rows[0]);
	if (removed?.webhookEndpointId) {
		// Best effort: stop DoDomain delivering to a receiver that no longer
		// has the secret to verify it.
		await dodomainClientFor(removed)
			.webhookEndpoints.delete(removed.webhookEndpointId)
			.catch(() => {});
	}
	return removed ?? null;
};

/** Checks the key works and reports which app it belongs to. */
export const testDoDomainConnection = async (params: {
	secretKey: string;
	baseUrl: string;
	appId?: string;
}) => {
	const { apps } = await dodomainClientFor(params).apps.list();
	return {
		apps: (apps ?? []).map((app) => ({
			id: app.id,
			name: app.name,
			sandbox: app.sandbox,
		})),
		appFound: !!params.appId && (apps ?? []).some((a) => a.id === params.appId),
	};
};

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

/** Same host shape DoDomain accepts for a session domain. */
const HOST_PATTERN =
	/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export const assertDoDomainHost = (host: string) => {
	const normalized = host.trim().toLowerCase();
	if (normalized.includes("*")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Wildcard domains cannot be connected through DoDomain; connect each hostname separately.",
		});
	}
	if (!HOST_PATTERN.test(normalized)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `"${host}" is not a hostname DoDomain can connect (expected something like app.customer.com).`,
		});
	}
	return normalized;
};

export const checkDoDomainHost = async (
	integration: DoDomainIntegration,
	host: string,
) => {
	const domain = assertDoDomainHost(host);
	return dodomainClientFor(integration).domains.check(domain);
};

export interface DoDomainServiceContext {
	kind: "application" | "compose";
	serviceId: string;
	organizationId: string;
	projectId: string;
	environmentId: string;
	projectName: string;
	serviceName: string;
	appName: string;
	serverId: string | null;
	serverIpAddress: string | null;
	application?: Awaited<ReturnType<typeof findApplicationById>>;
}

/**
 * Loads the service a domain routes to. Preview-deployment domains (and
 * orphan rows) are not connectable and resolve to null.
 */
export const resolveDoDomainService = async (
	domain: Pick<Domain, "applicationId" | "composeId">,
): Promise<DoDomainServiceContext | null> => {
	if (domain.applicationId) {
		const application = await findApplicationById(domain.applicationId);
		return {
			kind: "application",
			serviceId: application.applicationId,
			organizationId: application.environment.project.organizationId,
			projectId: application.environment.projectId,
			environmentId: application.environmentId,
			projectName: application.environment.project.name,
			serviceName: application.name,
			appName: application.appName,
			serverId: application.serverId ?? null,
			serverIpAddress: application.server?.ipAddress ?? null,
			application,
		};
	}
	if (domain.composeId) {
		const compose = await findComposeById(domain.composeId);
		return {
			kind: "compose",
			serviceId: compose.composeId,
			organizationId: compose.environment.project.organizationId,
			projectId: compose.environment.projectId,
			environmentId: compose.environmentId,
			projectName: compose.environment.project.name,
			serviceName: compose.name,
			appName: compose.appName,
			serverId: compose.serverId ?? null,
			serverIpAddress: compose.server?.ipAddress ?? null,
		};
	}
	return null;
};

/** Public IP the service's traffic arrives on (remote server or this panel). */
const resolveServicePublicIp = async (service: DoDomainServiceContext) => {
	if (service.serverId) {
		let ip = service.serverIpAddress ?? "";
		if (ip && isPrivateIp(ip) && process.env.NODE_ENV !== "development") {
			ip = (await getRemotePublicIp(service.serverId)) ?? "";
		}
		return ip && !isPrivateIp(ip) ? ip : null;
	}
	const settings = await getWebServerSettings();
	let ip = settings?.serverIp ?? "";
	if (ip && isPrivateIp(ip)) {
		ip = (await getPublicIpWithFallback()) ?? "";
	}
	return ip && !isPrivateIp(ip) ? ip : null;
};

/**
 * Pure: the records a domain must carry to reach the service. A subdomain
 * with a wildcard base available (project, server or organization wildcard,
 * the same precedence generated domains use) gets a CNAME to the service's
 * generated name under that base, so it follows the base if the server's IP
 * changes. A zone apex cannot hold a CNAME, and without a base there is
 * nothing to alias, so those get an A/AAAA record to the public IP.
 */
export const planDoDomainRecords = (params: {
	host: string;
	zone: string | null;
	baseDomain: string | null;
	appName: string;
	publicIp: string | null;
}): DoDomainRecord[] => {
	const { host, zone, baseDomain, appName, publicIp } = params;
	const isApex = zone === null ? true : host === zone;
	const cnameTarget = baseDomain ? `${appName}.${baseDomain}` : null;
	if (!isApex && cnameTarget && cnameTarget !== host) {
		return [{ type: "CNAME", host: "@", value: cnameTarget }];
	}
	if (publicIp) {
		return [
			{ type: isIPv6(publicIp) ? "AAAA" : "A", host: "@", value: publicIp },
		];
	}
	if (zone === null && cnameTarget && cnameTarget !== host) {
		return [{ type: "CNAME", host: "@", value: cnameTarget }];
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message:
			"Dokploy does not know a public IP for this service's server. Set the server IP (Settings → Web Server, or the remote server's IP) or configure a wildcard base domain first.",
	});
};

const loadConnectableDomain = async (domainId: string) => {
	const domain = await findDomainById(domainId);
	const service = await resolveDoDomainService(domain);
	if (!service) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Only application and compose domains can be connected through DoDomain.",
		});
	}
	return { domain, service };
};

const assertSameOrganization = (
	integration: DoDomainIntegration,
	service: DoDomainServiceContext,
) => {
	if (integration.organizationId !== service.organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this domain",
		});
	}
};

export const findLatestDoDomainSession = async (domainId: string) => {
	const session = await db.query.dodomainConnectSession.findFirst({
		where: eq(dodomainConnectSession.domainId, domainId),
		orderBy: [desc(dodomainConnectSession.createdAt)],
	});
	return session ?? null;
};

/**
 * Treats an expired, unfinished connect session like an abandoned one
 * (`session.abandoned`): a domain still "pending" whose current session is no
 * longer live goes back to "unverified" and drops its session id. Without
 * this a domain whose owner let the link expire stays on "Awaiting domain
 * owner" forever when the webhook never arrives (an instance on a private
 * network has no webhook endpoint registered).
 *
 * One conditional UPDATE, so it cannot clobber a status a webhook just set
 * (verified/failed are never touched) or a session created a moment ago:
 * - "live" is the session the domain currently points at, with a future
 *   `expiresAt`. A pointer to a missing row (the integration was removed and
 *   its sessions cascaded) or no pointer at all counts as not live too.
 * - a domain that already holds a DoDomain connection id is skipped: that id
 *   is only ever stored by the `session.completed` webhook, so the owner
 *   finished the flow and the domain is waiting for DNS verification, which
 *   the session's own expiry says nothing about.
 *
 * Returns the ids of the domains that were reset. Normally updates no rows.
 */
export const expireStaleDoDomainSessions = async (
	domainIds: string[],
): Promise<string[]> => {
	if (domainIds.length === 0) return [];
	const reset = await db
		.update(domains)
		.set({ dnsVerificationStatus: "unverified", dodomainSessionId: null })
		.where(
			and(
				inArray(domains.domainId, domainIds),
				eq(domains.dnsVerificationStatus, "pending"),
				isNull(domains.dodomainConnectionId),
				notExists(
					db
						.select({ live: sql`1` })
						.from(dodomainConnectSession)
						.where(
							and(
								eq(dodomainConnectSession.sessionId, domains.dodomainSessionId),
								gt(dodomainConnectSession.expiresAt, new Date()),
							),
						),
				),
			),
		)
		.returning({ domainId: domains.domainId });
	return reset.map((row) => row.domainId);
};

/**
 * Domain-list companion of {@link expireStaleDoDomainSessions}: resets the
 * pending rows whose connect session expired and returns the list as it now
 * stands in the database, without re-reading it. Skips the write entirely
 * when nothing in the list is pending.
 */
export const withExpiredDoDomainSessionsReset = async <
	T extends Pick<
		Domain,
		"domainId" | "dnsVerificationStatus" | "dodomainSessionId"
	>,
>(
	rows: T[],
): Promise<T[]> => {
	const pending = rows
		.filter((row) => row.dnsVerificationStatus === "pending")
		.map((row) => row.domainId);
	if (pending.length === 0) return rows;
	const reset = new Set(await expireStaleDoDomainSessions(pending));
	if (reset.size === 0) return rows;
	return rows.map((row) =>
		reset.has(row.domainId)
			? {
					...row,
					dnsVerificationStatus: "unverified" as const,
					dodomainSessionId: null,
				}
			: row,
	);
};

/**
 * Creates a DoDomain connect session for a domain's host asking for the
 * records the panel expects, stores the session on the domain (status
 * pending) and returns the hosted connect URL to hand to the end user.
 */
export const createDoDomainConnectSession = async (params: {
	integration: DoDomainIntegration;
	domainId: string;
}) => {
	const { integration } = params;
	const { domain, service } = await loadConnectableDomain(params.domainId);
	assertSameOrganization(integration, service);
	const host = assertDoDomainHost(domain.host);

	const client = dodomainClientFor(integration);
	const zone = await client.domains
		.check(host)
		.then((result) => result.zone?.toLowerCase() ?? null)
		.catch(() => null);
	const [{ baseDomain }, publicIp] = await Promise.all([
		resolveGeneratedDomainBase({
			projectId: service.projectId,
			serverId: service.serverId,
		}),
		resolveServicePublicIp(service),
	]);
	const records = planDoDomainRecords({
		host,
		zone,
		baseDomain,
		appName: service.appName,
		publicIp,
	});

	const session = await client.sessions
		.create({ domain: host, records })
		.catch((error) =>
			asBadRequest(error, "Error creating the DoDomain connect session"),
		);

	await db.insert(dodomainConnectSession).values({
		sessionId: session.id,
		domainId: domain.domainId,
		dodomainId: integration.dodomainId,
		connectUrl: session.connectUrl,
		records,
		expiresAt: new Date(session.expiresAt),
	});
	await updateDomainById(domain.domainId, {
		dodomainSessionId: session.id,
		// Keep a live verification; only a never-verified domain goes pending.
		...(domain.dnsVerificationStatus === "verified"
			? {}
			: { dnsVerificationStatus: "pending" as const }),
	});

	return {
		sessionId: session.id,
		connectUrl: session.connectUrl,
		expiresAt: session.expiresAt,
		records,
		warnings: session.warnings ?? [],
	};
};

/** Queues a DNS recheck; the verdict arrives later as a webhook. */
export const reverifyDoDomainDomain = async (params: {
	integration: DoDomainIntegration;
	domainId: string;
}) => {
	const { domain, service } = await loadConnectableDomain(params.domainId);
	assertSameOrganization(params.integration, service);
	if (!domain.dodomainConnectionId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This domain has no DoDomain connection yet. Send a connect link and let the domain owner finish it first.",
		});
	}
	await dodomainClientFor(params.integration)
		.connections.reverify(domain.dodomainConnectionId)
		.catch((error) => {
			if (error instanceof DoDomainError && error.status === 429) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message:
						"DoDomain checked this domain less than 10 minutes ago. Try again later.",
				});
			}
			return asBadRequest(error, "Error requesting a DoDomain recheck");
		});
	return { accepted: true as const };
};

export const getDoDomainConnectionStatus = async (params: {
	integration: DoDomainIntegration | null;
	domainId: string;
}) => {
	const loaded = await loadConnectableDomain(params.domainId);
	const { service } = loaded;
	if (params.integration) assertSameOrganization(params.integration, service);
	// An expired, unfinished connect link must not keep reading "pending".
	const [domain = loaded.domain] = await withExpiredDoDomainSessionsReset([
		loaded.domain,
	]);
	const session = domain.dodomainSessionId
		? await findLatestDoDomainSession(domain.domainId)
		: null;
	const liveSession =
		session && session.sessionId === domain.dodomainSessionId ? session : null;
	const expired = liveSession
		? liveSession.expiresAt.getTime() <= Date.now()
		: true;
	const status: DnsVerificationStatus =
		domain.dnsVerificationStatus ?? "unverified";
	return {
		configured: !!params.integration,
		status,
		verifiedAt: domain.dnsVerifiedAt,
		connectionId: domain.dodomainConnectionId,
		records: liveSession?.records ?? [],
		connectUrl:
			liveSession && !expired && status !== "verified"
				? liveSession.connectUrl
				: null,
		sessionExpiresAt: liveSession?.expiresAt ?? null,
		requiresRedeploy: service.kind === "compose",
	};
};

// ---------------------------------------------------------------------------
// Webhook receiver
// ---------------------------------------------------------------------------

interface WebhookEnvelope {
	id?: string;
	type: string;
	data: {
		test?: boolean;
		sessionId?: string;
		connectionId?: string;
		domain?: string;
		fqdn?: string;
		scope?: string;
		reason?: string;
		failedStep?: string;
		error?: string;
		[key: string]: unknown;
	};
}

export type DoDomainWebhookResult =
	| { status: 200; body: Record<string, unknown> }
	| { status: 400 | 401 | 500; body: { error: string } };

const parseEnvelope = (rawBody: string): WebhookEnvelope | null => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const value = parsed as Record<string, unknown>;
	// `type` is canonical; `event` is DoDomain's deprecated alias.
	const type =
		typeof value.type === "string"
			? value.type
			: typeof value.event === "string"
				? value.event
				: null;
	if (!type) return null;
	if (!value.data || typeof value.data !== "object") return null;
	const id =
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.id.length <= 191
			? value.id
			: undefined;
	return { id, type, data: value.data as WebhookEnvelope["data"] };
};

/** Integrations whose secret may have signed this delivery. */
const candidateIntegrations = async (integrationId?: string | null) => {
	if (integrationId) {
		const one = await db.query.dodomainIntegration.findFirst({
			where: eq(dodomainIntegration.dodomainId, integrationId),
		});
		return one ? [one] : [];
	}
	return db.query.dodomainIntegration.findMany();
};

/**
 * Finds the domain an event refers to by DoDomain's own handles only (never
 * by hostname, so one tenant's event can never match another tenant's row).
 */
const findDomainForEvent = async (data: WebhookEnvelope["data"]) => {
	const handles = [];
	if (typeof data.sessionId === "string" && data.sessionId) {
		handles.push(eq(domains.dodomainSessionId, data.sessionId));
	}
	if (typeof data.connectionId === "string" && data.connectionId) {
		handles.push(eq(domains.dodomainConnectionId, data.connectionId));
	}
	if (handles.length === 0) return null;
	const domain = await db.query.domains.findFirst({ where: or(...handles) });
	return domain ?? null;
};

const describeFailure = (type: string, data: WebhookEnvelope["data"]) => {
	if (type === "connection.disconnected") {
		return "The DoDomain connection was disconnected; DoDomain no longer monitors this domain's DNS.";
	}
	if (data.scope === "session" || data.reason === "session_failed") {
		const step =
			data.failedStep === "oauth_authorize"
				? "the DNS provider authorization"
				: data.failedStep === "record_write"
					? "writing the DNS records"
					: "the connect flow";
		return `The domain owner's connect attempt failed at ${step}${
			data.error ? `: ${data.error}` : "."
		} They can retry from the same connect link.`;
	}
	return `The DNS records for ${data.fqdn ?? data.domain ?? "the domain"} no longer match what Dokploy expects (DNS drift).`;
};

const domainsLink = async (service: DoDomainServiceContext) =>
	`${await getDokployUrl()}/dashboard/project/${service.projectId}/environment/${service.environmentId}/services/${service.kind}/${service.serviceId}?tab=domains`;

/** Re-applies a verified domain the same way saving it does. */
const applyVerifiedDomain = async (
	service: DoDomainServiceContext,
	domain: Domain,
) => {
	// Applications route through Traefik's file provider: rewriting the router
	// (with its certResolver when https) makes Traefik request the certificate
	// now that DNS points here. Compose domains are docker labels and only
	// change on the next deploy.
	if (service.kind === "application" && service.application) {
		await manageDomain(service.application, domain);
	}
};

const applyEvent = async (
	integration: DoDomainIntegration,
	envelope: WebhookEnvelope,
) => {
	const { type, data } = envelope;
	const domain = await findDomainForEvent(data);
	if (!domain) return { applied: false, reason: "unknown_domain" };
	const service = await resolveDoDomainService(domain);
	// Cross-tenant guard: a delivery signed with one organization's secret may
	// only ever touch that organization's domains.
	if (!service || service.organizationId !== integration.organizationId) {
		return { applied: false, reason: "foreign_domain" };
	}

	switch (type) {
		case "connection.verified": {
			const updated = await updateDomainById(domain.domainId, {
				dnsVerificationStatus: "verified",
				dnsVerifiedAt: new Date(),
				...(data.connectionId
					? { dodomainConnectionId: data.connectionId }
					: {}),
			});
			await applyVerifiedDomain(service, { ...domain, ...(updated ?? {}) });
			return { applied: true };
		}
		case "connection.failed":
		case "connection.disconnected": {
			await updateDomainById(domain.domainId, {
				dnsVerificationStatus: "failed",
				...(type === "connection.disconnected"
					? { dodomainConnectionId: null }
					: data.connectionId
						? { dodomainConnectionId: data.connectionId }
						: {}),
			});
			await sendDomainVerificationFailedNotifications({
				organizationId: service.organizationId,
				projectName: service.projectName,
				serviceName: service.serviceName,
				host: domain.host,
				reason: describeFailure(type, data),
				domainLink: await domainsLink(service),
			}).catch((error) => {
				console.error("[dodomain] failure notification error:", error);
			});
			return { applied: true };
		}
		case "session.completed": {
			if (!data.connectionId)
				return { applied: false, reason: "no_connection" };
			await updateDomainById(domain.domainId, {
				dodomainConnectionId: data.connectionId,
			});
			return { applied: true };
		}
		case "session.abandoned": {
			// Strict: only the domain still carrying THIS session is reset, so a
			// stale event cannot clear a newer session.
			if (!data.sessionId || domain.dodomainSessionId !== data.sessionId) {
				return { applied: false, reason: "stale_session" };
			}
			await updateDomainById(domain.domainId, {
				dodomainSessionId: null,
				...(domain.dnsVerificationStatus === "pending"
					? { dnsVerificationStatus: "unverified" as const }
					: {}),
			});
			return { applied: true };
		}
		default:
			// Forward-compatible: unknown event types are acknowledged.
			return { applied: false, reason: "unhandled_event" };
	}
};

/**
 * Handles one DoDomain webhook delivery. The HMAC over the raw body is the
 * only authentication: nothing is parsed or written before it verifies.
 * Returns the HTTP status/body for the route to send.
 */
export const handleDoDomainWebhook = async (params: {
	rawBody: string;
	signature: string | null | undefined;
	deliveryIdHeader?: string | null;
	integrationId?: string | null;
}): Promise<DoDomainWebhookResult> => {
	const { rawBody, signature } = params;
	if (!signature) {
		return { status: 401, body: { error: "invalid_signature" } };
	}
	const candidates = await candidateIntegrations(params.integrationId);
	const integration = candidates.find(
		(candidate) =>
			!!candidate.webhookSecret &&
			verifyDoDomainSignature(candidate.webhookSecret, rawBody, signature),
	);
	if (!integration) {
		return { status: 401, body: { error: "invalid_signature" } };
	}

	const envelope = parseEnvelope(rawBody);
	if (!envelope) {
		return { status: 400, body: { error: "invalid_payload" } };
	}
	// Dashboard "send test" pings: acknowledge, never write.
	if (envelope.data.test === true) {
		return { status: 200, body: { received: true, test: true } };
	}

	const deliveryId = envelope.id ?? params.deliveryIdHeader ?? null;
	if (deliveryId) {
		const claimed = await db
			.insert(dodomainWebhookDelivery)
			.values({ deliveryId })
			.onConflictDoNothing()
			.returning();
		if (claimed.length === 0) {
			return { status: 200, body: { received: true, duplicate: true } };
		}
	}

	try {
		const outcome = await applyEvent(integration, envelope);
		return {
			status: 200,
			body: {
				received: true,
				...(outcome.applied ? {} : { ignored: outcome.reason }),
			},
		};
	} catch (error) {
		console.error("[dodomain] webhook apply failed:", error);
		// Not applied: release the claim so DoDomain's retry can run it again.
		if (deliveryId) {
			try {
				await db
					.delete(dodomainWebhookDelivery)
					.where(eq(dodomainWebhookDelivery.deliveryId, deliveryId));
			} catch (releaseError) {
				console.error(
					"[dodomain] could not release delivery claim:",
					releaseError,
				);
			}
		}
		return { status: 500, body: { error: "apply_failed" } };
	}
};
