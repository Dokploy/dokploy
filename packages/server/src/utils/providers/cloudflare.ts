/**
 * Minimal Cloudflare API client.
 *
 * Uses the native `fetch` available in Node 18+, so no extra dependency is
 * required. Only the calls needed for the integration credential layer live
 * here today (token + account verification); tunnel/DNS/Access helpers are
 * layered on in later iterations.
 *
 * The caller's API token is sent as a bearer credential and is never logged or
 * included in thrown error messages.
 */

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareApiErrorDetail {
	code: number;
	message: string;
}

export interface CloudflareApiResponse<T> {
	success: boolean;
	errors: CloudflareApiErrorDetail[];
	messages: unknown[];
	result: T;
}

/**
 * Error thrown for any non-successful Cloudflare API response. The message is
 * derived from Cloudflare's structured `errors` array and never includes the
 * caller's API token.
 */
export class CloudflareApiError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CloudflareApiError";
	}
}

const buildErrorMessage = (
	status: number,
	errors: CloudflareApiErrorDetail[] | undefined,
): string => {
	const first = errors?.[0];
	if (first?.message) {
		return first.message;
	}
	return `Cloudflare API request failed (HTTP ${status})`;
};

/**
 * Performs an authenticated request against the Cloudflare v4 API and unwraps
 * the standard `{ success, errors, result }` envelope. Throws a
 * {@link CloudflareApiError} on transport failure or `success: false`.
 */
export const cloudflareRequest = async <T>(
	apiToken: string,
	path: string,
	init?: RequestInit,
): Promise<T> => {
	const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});

	let body: CloudflareApiResponse<T> | undefined;
	try {
		body = (await response.json()) as CloudflareApiResponse<T>;
	} catch {
		body = undefined;
	}

	if (!response.ok || !body?.success) {
		throw new CloudflareApiError(
			buildErrorMessage(response.status, body?.errors),
		);
	}

	return body.result;
};

/**
 * Fetches every page of a Cloudflare list endpoint. The plain list calls return
 * only the first page, so an account with more zones/tunnels than one page would
 * otherwise have results silently truncated — e.g. a host whose zone sorts onto
 * page 2 would fail to resolve, blocking publishing for large accounts. Loops
 * until a short page comes back. `path` may already carry a query string; the
 * pagination params are appended.
 */
const cloudflareRequestAllPages = async <T>(
	apiToken: string,
	path: string,
	perPage = 50,
): Promise<T[]> => {
	const separator = path.includes("?") ? "&" : "?";
	const maxPages = 1000;
	const all: T[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const batch = await cloudflareRequest<T[]>(
			apiToken,
			`${path}${separator}page=${page}&per_page=${perPage}`,
		);
		all.push(...batch);
		if (batch.length < perPage) {
			return all;
		}
	}
	// Still a full page after the cap: bail loudly rather than silently
	// truncating, so a missing zone/tunnel surfaces as an error instead of a
	// confusing "not found".
	throw new CloudflareApiError(
		`Cloudflare returned more than ${maxPages * perPage} results for "${path}"; refusing to page further.`,
	);
};

export interface CloudflareTokenStatus {
	id: string;
	status: string;
}

/**
 * Verifies an API token via `GET /user/tokens/verify`. Throws if the token is
 * invalid or not in the `active` state.
 */
export const verifyToken = async (
	apiToken: string,
): Promise<CloudflareTokenStatus> => {
	const result = await cloudflareRequest<CloudflareTokenStatus>(
		apiToken,
		"/user/tokens/verify",
	);
	if (result.status !== "active") {
		throw new CloudflareApiError(
			`Cloudflare API token is not active (status: ${result.status})`,
		);
	}
	return result;
};

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export interface CloudflareZone {
	id: string;
	name: string;
	status: string;
}

/** Lists every zone the token can access (`GET /zones`, all pages). */
export const listZones = async (apiToken: string): Promise<CloudflareZone[]> =>
	cloudflareRequestAllPages<CloudflareZone>(apiToken, "/zones");

// ---------------------------------------------------------------------------
// Tunnels (Cloudflare Tunnel / cloudflared)
// ---------------------------------------------------------------------------

/** `config_src: "cloudflare"` = remotely managed; `"local"` = managed by a config file. */
export type CloudflareTunnelConfigSrc = "cloudflare" | "local";

export interface CloudflareTunnel {
	id: string;
	name: string;
	config_src?: CloudflareTunnelConfigSrc;
	status?: string;
	deleted_at?: string | null;
}

/** Lists all non-deleted tunnels for the account (all pages). */
export const listTunnels = async (
	apiToken: string,
	accountId: string,
): Promise<CloudflareTunnel[]> =>
	cloudflareRequestAllPages<CloudflareTunnel>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel?is_deleted=false`,
	);

export const getTunnel = async (
	apiToken: string,
	accountId: string,
	tunnelId: string,
): Promise<CloudflareTunnel> =>
	cloudflareRequest<CloudflareTunnel>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}`,
	);

/** Creates a remotely-managed tunnel (`config_src: "cloudflare"`). */
export const createTunnel = async (
	apiToken: string,
	accountId: string,
	name: string,
): Promise<CloudflareTunnel> =>
	cloudflareRequest<CloudflareTunnel>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel`,
		{
			method: "POST",
			body: JSON.stringify({ name, config_src: "cloudflare" }),
		},
	);

export const deleteTunnel = async (
	apiToken: string,
	accountId: string,
	tunnelId: string,
): Promise<void> => {
	await cloudflareRequest(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}`,
		{ method: "DELETE" },
	);
};

/**
 * Fetches the connector token for a tunnel. The token is a secret used to run
 * the `cloudflared` connector; never persist it or log it.
 */
export const getTunnelToken = async (
	apiToken: string,
	accountId: string,
	tunnelId: string,
): Promise<string> =>
	cloudflareRequest<string>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/token`,
	);

// ---------------------------------------------------------------------------
// Tunnel ingress configuration
// ---------------------------------------------------------------------------

export interface CloudflareIngressRule {
	hostname?: string;
	path?: string;
	service: string;
	originRequest?: Record<string, unknown>;
}

export interface CloudflareTunnelConfig {
	ingress?: CloudflareIngressRule[];
	[key: string]: unknown;
}

export interface CloudflareTunnelConfigResponse {
	tunnel_id: string;
	config: CloudflareTunnelConfig | null;
	/** "cloudflare" for remotely-managed tunnels, "local" otherwise. */
	source?: CloudflareTunnelConfigSrc;
}

/** The fallback ingress rule that cloudflared requires to be last. */
export const CATCH_ALL_INGRESS_SERVICE = "http_status:404";

export const getTunnelConfiguration = async (
	apiToken: string,
	accountId: string,
	tunnelId: string,
): Promise<CloudflareTunnelConfigResponse> =>
	cloudflareRequest<CloudflareTunnelConfigResponse>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/configurations`,
	);

export const putTunnelConfiguration = async (
	apiToken: string,
	accountId: string,
	tunnelId: string,
	config: CloudflareTunnelConfig,
): Promise<CloudflareTunnelConfigResponse> =>
	cloudflareRequest<CloudflareTunnelConfigResponse>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/configurations`,
		{ method: "PUT", body: JSON.stringify({ config }) },
	);

/**
 * Returns the trailing catch-all rule (a rule with no hostname). cloudflared
 * requires the last ingress rule to have no hostname; we preserve a
 * user-defined catch-all if present, otherwise default to `http_status:404`.
 */
const resolveCatchAll = (
	rules: CloudflareIngressRule[],
): CloudflareIngressRule => {
	const last = rules[rules.length - 1];
	if (last && !last.hostname) {
		return last;
	}
	return { service: CATCH_ALL_INGRESS_SERVICE };
};

/**
 * Splits an ingress list into the host rules to preserve (every host rule
 * except our managed entry for `hostname`, matched by hostname with no path)
 * and the catch-all that must stay last. Shared by upsert/remove so the
 * "what counts as our managed rule" predicate lives in one place.
 *
 * Only hostname-bearing rules are preserved: in cloudflared a rule with no
 * hostname matches every request, so a hostname-less rule is only valid as the
 * trailing catch-all (handled by `resolveCatchAll`). Keeping a *non-terminal*
 * hostname-less rule would place it ahead of our host rule and swallow that
 * host's traffic, so such rules are intentionally dropped.
 */
const partitionHostRules = (
	existing: CloudflareIngressRule[] | undefined,
	hostname: string,
): { preserved: CloudflareIngressRule[]; catchAll: CloudflareIngressRule } => {
	const rules = existing ?? [];
	const catchAll = resolveCatchAll(rules);
	const preserved = rules
		.filter((rule) => !!rule.hostname)
		.filter((rule) => !(rule.hostname === hostname && !rule.path));
	return { preserved, catchAll };
};

/**
 * Upserts a single per-host ingress rule into an existing ingress list.
 *
 * - preserves every other (unknown) host rule, in order;
 * - replaces our managed entry for `hostname` (matched by hostname with no
 *   path), so repeated calls are idempotent;
 * - keeps a single catch-all rule last (preserving a user-defined one).
 */
export const upsertIngressRule = (
	existing: CloudflareIngressRule[] | undefined,
	hostname: string,
	service: string,
): CloudflareIngressRule[] => {
	const { preserved, catchAll } = partitionHostRules(existing, hostname);
	return [...preserved, { hostname, service }, catchAll];
};

/**
 * Removes our managed per-host ingress rule for `hostname`, preserving unknown
 * rules and keeping the catch-all last.
 */
export const removeIngressRule = (
	existing: CloudflareIngressRule[] | undefined,
	hostname: string,
): CloudflareIngressRule[] => {
	const { preserved, catchAll } = partitionHostRules(existing, hostname);
	return [...preserved, catchAll];
};

/**
 * True when the ingress list already contains a per-host rule for `hostname`
 * (matched by hostname with no path — the exact entry `upsertIngressRule` would
 * replace). Used to detect a route we'd otherwise clobber so callers can verify
 * Dokploy ownership before overwriting it.
 */
export const hasHostIngressRule = (
	existing: CloudflareIngressRule[] | undefined,
	hostname: string,
): boolean =>
	(existing ?? []).some((rule) => rule.hostname === hostname && !rule.path);

// ---------------------------------------------------------------------------
// DNS records
// ---------------------------------------------------------------------------

/** Comment tag marking a DNS record as owned/managed by Dokploy. */
export const DOKPLOY_DNS_COMMENT = "Managed by Dokploy";

export interface CloudflareDnsRecord {
	id: string;
	type: string;
	name: string;
	content: string;
	proxied?: boolean;
	comment?: string;
}

/** The CNAME target a proxied hostname must point at for a tunnel. */
export const tunnelCnameTarget = (tunnelId: string): string =>
	`${tunnelId}.cfargotunnel.com`;

export const findDnsRecordByName = async (
	apiToken: string,
	zoneId: string,
	name: string,
): Promise<CloudflareDnsRecord | undefined> => {
	const records = await cloudflareRequest<CloudflareDnsRecord[]>(
		apiToken,
		`/zones/${encodeURIComponent(zoneId)}/dns_records?name=${encodeURIComponent(name)}`,
	);
	return records[0];
};

/**
 * Decides whether an existing DNS record may be adopted/overwritten by Dokploy.
 *
 * The `DOKPLOY_DNS_COMMENT` tag is a weak signal — it is user-editable and
 * identical across every Dokploy install — so the caller supplies DB-derived
 * ownership facts:
 *  - `expectedRecordId`: the record id this domain row already stores (an
 *    idempotent re-run of our own record), and
 *  - `adoptable`: a sibling Dokploy domain row in *this* database already owns a
 *    record for the host (e.g. path-domains sharing one CNAME).
 */
export interface DnsOwnership {
	expectedRecordId?: string | null;
	adoptable?: boolean;
}

/**
 * Ensures a proxied `CNAME host -> <tunnelId>.cfargotunnel.com` record exists,
 * tagged as Dokploy-managed. Refuses to overwrite a record that is not
 * Dokploy-managed (user-owned DNS is never clobbered) or that carries the
 * Dokploy tag but is not tracked by this instance (another install / orphan).
 */
export const upsertTunnelDnsRecord = async (
	apiToken: string,
	zoneId: string,
	host: string,
	tunnelId: string,
	ownership: DnsOwnership = {},
): Promise<CloudflareDnsRecord> => {
	const content = tunnelCnameTarget(tunnelId);
	const body = {
		type: "CNAME",
		name: host,
		content,
		proxied: true,
		comment: DOKPLOY_DNS_COMMENT,
	};
	const existing = await findDnsRecordByName(apiToken, zoneId, host);
	if (existing) {
		if (existing.comment !== DOKPLOY_DNS_COMMENT) {
			throw new CloudflareApiError(
				`A DNS record for "${host}" already exists and is not managed by Dokploy; refusing to overwrite it.`,
			);
		}
		const owned =
			ownership.expectedRecordId === existing.id || !!ownership.adoptable;
		if (!owned) {
			throw new CloudflareApiError(
				`A DNS record for "${host}" already exists and is not tracked by this Dokploy instance; refusing to overwrite it.`,
			);
		}
		return cloudflareRequest<CloudflareDnsRecord>(
			apiToken,
			`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(existing.id)}`,
			{ method: "PATCH", body: JSON.stringify(body) },
		);
	}
	return cloudflareRequest<CloudflareDnsRecord>(
		apiToken,
		`/zones/${encodeURIComponent(zoneId)}/dns_records`,
		{ method: "POST", body: JSON.stringify(body) },
	);
};

const deleteDnsRecord = async (
	apiToken: string,
	zoneId: string,
	recordId: string,
): Promise<void> => {
	await cloudflareRequest(
		apiToken,
		`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
		{ method: "DELETE" },
	);
};

/** Deletes the host's CNAME only if it is Dokploy-managed (idempotent). */
export const deleteTunnelDnsRecord = async (
	apiToken: string,
	zoneId: string,
	host: string,
): Promise<void> => {
	const existing = await findDnsRecordByName(apiToken, zoneId, host);
	if (existing && existing.comment === DOKPLOY_DNS_COMMENT) {
		await deleteDnsRecord(apiToken, zoneId, existing.id);
	}
};

// ---------------------------------------------------------------------------
// Access (Zero Trust)
// ---------------------------------------------------------------------------

export interface CloudflareAccessApplicationResponse {
	id: string;
	name: string;
	domain: string;
	type: string;
	session_duration?: string;
}

export interface CloudflareAccessPolicy {
	id: string;
	name: string;
	decision: string;
}

/** A single include rule for an Access allow policy. */
export type CloudflareAccessInclude =
	| { email: { email: string } }
	| { email_domain: { domain: string } };

/**
 * Builds Access policy `include` rules from allow-lists. An empty result means
 * the policy would allow no one — callers should validate before sending.
 */
export const buildAccessIncludeRules = (
	allowEmails: string[],
	allowEmailDomains: string[],
): CloudflareAccessInclude[] => [
	...allowEmails.map((email) => ({ email: { email } })),
	...allowEmailDomains.map((domain) => ({ email_domain: { domain } })),
];

const accessApplicationBody = (input: {
	name: string;
	domain: string;
	sessionDuration?: string;
}) => ({
	name: input.name,
	type: "self_hosted",
	domain: input.domain,
	session_duration: input.sessionDuration ?? "24h",
});

const accessPolicyBody = (input: {
	name: string;
	include: CloudflareAccessInclude[];
}) => ({
	name: input.name,
	decision: "allow",
	include: input.include,
});

export const createAccessApplication = async (
	apiToken: string,
	accountId: string,
	input: { name: string; domain: string; sessionDuration?: string },
): Promise<CloudflareAccessApplicationResponse> =>
	cloudflareRequest<CloudflareAccessApplicationResponse>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/access/apps`,
		{ method: "POST", body: JSON.stringify(accessApplicationBody(input)) },
	);

export const updateAccessApplication = async (
	apiToken: string,
	accountId: string,
	appId: string,
	input: { name: string; domain: string; sessionDuration?: string },
): Promise<CloudflareAccessApplicationResponse> =>
	cloudflareRequest<CloudflareAccessApplicationResponse>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/access/apps/${encodeURIComponent(appId)}`,
		{ method: "PUT", body: JSON.stringify(accessApplicationBody(input)) },
	);

/** Deleting the application also removes its app-scoped policies. */
export const deleteAccessApplication = async (
	apiToken: string,
	accountId: string,
	appId: string,
): Promise<void> => {
	await cloudflareRequest(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/access/apps/${encodeURIComponent(appId)}`,
		{ method: "DELETE" },
	);
};

export const createAccessPolicy = async (
	apiToken: string,
	accountId: string,
	appId: string,
	input: { name: string; include: CloudflareAccessInclude[] },
): Promise<CloudflareAccessPolicy> =>
	cloudflareRequest<CloudflareAccessPolicy>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/access/apps/${encodeURIComponent(appId)}/policies`,
		{ method: "POST", body: JSON.stringify(accessPolicyBody(input)) },
	);

export const updateAccessPolicy = async (
	apiToken: string,
	accountId: string,
	appId: string,
	policyId: string,
	input: { name: string; include: CloudflareAccessInclude[] },
): Promise<CloudflareAccessPolicy> =>
	cloudflareRequest<CloudflareAccessPolicy>(
		apiToken,
		`/accounts/${encodeURIComponent(accountId)}/access/apps/${encodeURIComponent(appId)}/policies/${encodeURIComponent(policyId)}`,
		{ method: "PUT", body: JSON.stringify(accessPolicyBody(input)) },
	);
