import { db } from "@dokploy/server/db";
import { domains } from "@dokploy/server/db/schema";
import { findApplicationById } from "@dokploy/server/services/application";
import { findCloudflareById } from "@dokploy/server/services/cloudflare";
import {
	ensureSharedManagedTunnel,
	findRuntimeByTunnelId,
	teardownSharedManagedTunnel,
	withTunnelLock,
} from "@dokploy/server/services/cloudflare-runtime";
import { findComposeById } from "@dokploy/server/services/compose";
import { type Domain, updateDomainById } from "@dokploy/server/services/domain";
import {
	CloudflareApiError,
	DOKPLOY_DNS_COMMENT,
	deleteTunnelDnsRecord,
	findDnsRecordByName,
	getTunnel,
	getTunnelConfiguration,
	hasHostIngressRule,
	listZones,
	putTunnelConfiguration,
	removeIngressRule,
	upsertIngressRule,
	upsertTunnelDnsRecord,
} from "@dokploy/server/utils/providers/cloudflare";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";

/**
 * When deprovisioning as part of a bulk/cascade delete, the sibling domain rows
 * being removed are still present in the DB. Callers pass their IDs so the
 * "is this route/tunnel still in use?" checks exclude them.
 */
export interface DeprovisionOptions {
	alsoRemovingDomainIds?: string[];
}

/** Internal origin cloudflared forwards to: Dokploy's Traefik over plain HTTP. */
export const INTERNAL_TRAEFIK_SERVICE = "http://dokploy-traefik:80";

/** True when a domain row carries Cloudflare publish intent. */
export const isCloudflarePublished = (domain: Partial<Domain>): boolean =>
	!!domain.publishToCloudflare && !!domain.cloudflareId;

/** True when a domain row has any provisioned Cloudflare state to clean up. */
const hasProvisionedState = (domain: Partial<Domain>): boolean =>
	!!domain.cloudflareId &&
	(!!domain.cloudflareIngressApplied ||
		!!domain.cloudflareDnsRecordId ||
		!!domain.cloudflareTunnelId);

/**
 * Resolves the Cloudflare zone that owns `host` by matching it against the
 * account's zones. The most specific (longest) matching zone name wins, so a
 * subdomain zone takes precedence over its parent. A published host belongs to
 * exactly one zone, so the zone is fully derived from the host — callers never
 * specify it.
 */
export const resolveZoneIdForHost = async (
	apiToken: string,
	host: string,
): Promise<string> => {
	const zones = await listZones(apiToken);
	// Hostnames and Cloudflare zone names are case-insensitive; compare lowercased
	// so a mixed-case host (e.g. "App.Example.com") still matches "example.com".
	const normalizedHost = host.trim().toLowerCase();
	const match = zones
		.filter((zone) => {
			const zoneName = zone.name.toLowerCase();
			return (
				normalizedHost === zoneName || normalizedHost.endsWith(`.${zoneName}`)
			);
		})
		.sort((a, b) => b.name.length - a.name.length)[0];
	if (!match) {
		throw new Error(
			`No Cloudflare zone in this account matches "${host}". Add the domain to Cloudflare first.`,
		);
	}
	return match.id;
};

const resolveServerId = async (domain: Domain): Promise<string | null> => {
	if (domain.applicationId) {
		const application = await findApplicationById(domain.applicationId);
		return application.serverId ?? null;
	}
	if (domain.composeId) {
		const compose = await findComposeById(domain.composeId);
		return compose.serverId ?? null;
	}
	return null;
};

/**
 * True when a Dokploy-managed domain row in this database already owns the
 * per-host ingress rule for `host` on `tunnelId` — i.e. some published domain
 * actually applied it (`cloudflareIngressApplied`). This is the ownership signal
 * for the no-clobber guard: it INCLUDES the current domain on a re-run (so
 * idempotent re-provisioning is allowed), but on a first publish the current row
 * is not yet `cloudflareIngressApplied`, so a pre-existing rule for the host must
 * have come from something Dokploy doesn't manage.
 */
const isIngressHostOwned = async (
	host: string,
	tunnelId: string,
): Promise<boolean> => {
	const rows = await db.query.domains.findMany({
		where: and(
			eq(domains.host, host),
			eq(domains.cloudflareTunnelId, tunnelId),
			eq(domains.publishToCloudflare, true),
			eq(domains.cloudflareIngressApplied, true),
		),
		columns: { domainId: true },
	});
	return rows.length > 0;
};

/**
 * Ownership facts for the host's CNAME, derived from this database: the record
 * id the domain already stores (idempotent re-run) and whether a sibling Dokploy
 * domain row already owns a record for the SAME host on the SAME tunnel
 * (path-domains sharing one CNAME). Requiring the tunnel match means we never
 * adopt — and then repoint — a record that a different tunnel already serves.
 * Passed to `upsertTunnelDnsRecord` so a Dokploy-tagged record from another
 * install/orphan is not blindly adopted.
 */
const resolveDnsOwnership = async (
	domain: Domain,
	tunnelId: string,
): Promise<{ expectedRecordId?: string | null; adoptable: boolean }> => {
	const siblings = await db.query.domains.findMany({
		where: and(
			eq(domains.host, domain.host),
			eq(domains.cloudflareTunnelId, tunnelId),
			eq(domains.publishToCloudflare, true),
			isNotNull(domains.cloudflareDnsRecordId),
			notInArray(domains.domainId, [domain.domainId]),
		),
		columns: { domainId: true },
	});
	return {
		expectedRecordId: domain.cloudflareDnsRecordId,
		adoptable: siblings.length > 0,
	};
};

const applyIngress = async (
	apiToken: string,
	accountId: string,
	tunnelId: string,
	mutate: (
		ingress: Parameters<typeof putTunnelConfiguration>[3]["ingress"],
	) => Parameters<typeof putTunnelConfiguration>[3]["ingress"],
): Promise<void> => {
	await withTunnelLock(tunnelId, async () => {
		const current = await getTunnelConfiguration(apiToken, accountId, tunnelId);
		// Never edit a locally-managed tunnel (config file owned by the user).
		if (current.source && current.source !== "cloudflare") {
			throw new Error(
				"Refusing to modify a locally-managed Cloudflare tunnel (config_src is not 'cloudflare')",
			);
		}
		const ingress = mutate(current.config?.ingress);
		await putTunnelConfiguration(apiToken, accountId, tunnelId, {
			...current.config,
			ingress,
		});
	});
};

/**
 * Provisions Cloudflare Tunnel publishing for a domain: resolves the tunnel
 * (shared-managed or existing-instance), upserts a per-host ingress rule,
 * upserts a proxied CNAME, and persists provisioning status. Idempotent — safe
 * to re-run. On partial failure it compensates by undoing the steps it applied.
 */
export const provisionCloudflareForDomain = async (
	domain: Domain,
): Promise<void> => {
	if (!isCloudflarePublished(domain) || domain.domainType === "preview") {
		return;
	}
	const cloudflareId = domain.cloudflareId as string;
	const integration = await findCloudflareById(cloudflareId);
	const { apiToken, accountId, organizationId } = integration;
	const serverId = await resolveServerId(domain);
	const mode = domain.cloudflareTunnelMode ?? "shared-managed";

	// Resolve the zone from the host BEFORE creating any shared tunnel/connector.
	// Otherwise a failure throws after the tunnel exists but before its id is
	// persisted on the domain row, leaving an untrackable orphaned tunnel.
	const zoneId = await resolveZoneIdForHost(apiToken, domain.host);

	// 1. Resolve the tunnel.
	let tunnelId: string;
	if (mode === "existing-instance") {
		const existingTunnelId =
			domain.cloudflareTunnelId || integration.defaultTunnelId;
		if (!existingTunnelId) {
			throw new Error(
				"A tunnel must be selected when using an existing Cloudflare tunnel",
			);
		}
		const tunnel = await getTunnel(apiToken, accountId, existingTunnelId);
		if (tunnel.config_src !== "cloudflare") {
			throw new Error(
				"The selected tunnel is locally-managed; only remotely-managed tunnels can be used",
			);
		}
		tunnelId = tunnel.id;
	} else {
		const runtime = await ensureSharedManagedTunnel({
			integration,
			organizationId,
			serverId,
		});
		tunnelId = runtime.tunnelId;
	}

	// Whether an existing route for this host belongs to Dokploy. Computed from
	// the DB up front; the authoritative no-clobber check runs inside the tunnel
	// lock below against the freshly-fetched config so it can't race a concurrent
	// publish.
	const [ingressOwned, dnsOwnership] = await Promise.all([
		isIngressHostOwned(domain.host, tunnelId),
		resolveDnsOwnership(domain, tunnelId),
	]);

	// Track applied steps so we can compensate on a later failure.
	let ingressApplied = false;
	try {
		// 2. Ingress (per-host, preserves unknown rules + catch-all). Refuse to
		// overwrite a host rule we don't own (another resource on this tunnel).
		await applyIngress(apiToken, accountId, tunnelId, (ingress) => {
			if (!ingressOwned && hasHostIngressRule(ingress, domain.host)) {
				throw new CloudflareApiError(
					`"${domain.host}" is already routed through this tunnel by a resource not managed by Dokploy; refusing to overwrite it.`,
				);
			}
			return upsertIngressRule(ingress, domain.host, INTERNAL_TRAEFIK_SERVICE);
		});
		ingressApplied = true;

		// 3. DNS (proxied CNAME -> tunnel, Dokploy-owned).
		const record = await upsertTunnelDnsRecord(
			apiToken,
			zoneId,
			domain.host,
			tunnelId,
			dnsOwnership,
		);

		// 4. Persist provisioning status.
		await updateDomainById(domain.domainId, {
			cloudflareTunnelMode: mode,
			cloudflareTunnelId: tunnelId,
			cloudflareZoneId: zoneId,
			cloudflareDnsRecordId: record.id,
			cloudflareIngressApplied: true,
		});
	} catch (error) {
		// Compensating cleanup for the steps we applied. The ingress rule and the
		// CNAME are shared by sibling path-domains, so only remove each when no
		// sibling still needs it, at the right granularity:
		//  - ingress is per (host, tunnel): keep it if a sibling serves this host on
		//    THIS tunnel; otherwise our just-added rule would be orphaned (e.g. a
		//    failed publish to a different tunnel than a sibling already uses);
		//  - the CNAME is per host: keep it if any sibling still serves the host.
		if (ingressApplied && !(await isIngressHostOwned(domain.host, tunnelId))) {
			try {
				await applyIngress(apiToken, accountId, tunnelId, (ingress) =>
					removeIngressRule(ingress, domain.host),
				);
			} catch {
				// best-effort
			}
		}
		if (!(await hostStillInUse(domain, {}).catch(() => false))) {
			try {
				await deleteTunnelDnsRecord(apiToken, zoneId, domain.host);
			} catch {
				// best-effort
			}
		}
		throw error;
	}
};

/**
 * Returns the published domain rows (other than `domain` and any sibling rows
 * being removed alongside it) that still serve `host`. The DNS record + tunnel
 * ingress entry are per-host, so they must stay while any sibling path-domain
 * on the same host is still published.
 */
const hostStillInUse = async (
	domain: Domain,
	options: DeprovisionOptions,
): Promise<boolean> => {
	const exclude = [domain.domainId, ...(options.alsoRemovingDomainIds ?? [])];
	const siblings = await db.query.domains.findMany({
		where: and(
			eq(domains.host, domain.host),
			eq(domains.publishToCloudflare, true),
			notInArray(domains.domainId, exclude),
		),
	});
	return siblings.length > 0;
};

/**
 * Removes the per-host route (proxied CNAME + tunnel ingress entry) for a
 * domain, WITHOUT tearing down the shared connector/tunnel. Best-effort and
 * idempotent. Skips removal when a sibling path-domain still uses the same host.
 */
export const removeCloudflareRoute = async (
	domain: Domain,
	options: DeprovisionOptions = {},
): Promise<void> => {
	if (!hasProvisionedState(domain)) {
		return;
	}
	if (await hostStillInUse(domain, options)) {
		// Another published domain still serves this host; keep the route.
		return;
	}
	const cloudflareId = domain.cloudflareId as string;
	const integration = await findCloudflareById(cloudflareId).catch(() => null);
	if (!integration) {
		return;
	}
	const { apiToken, accountId } = integration;
	// Prefer the zone persisted at provision time; fall back to resolving from
	// the host. Best-effort — never let cleanup throw.
	const zoneId =
		domain.cloudflareZoneId ||
		(await resolveZoneIdForHost(apiToken, domain.host).catch(() => null));

	if (zoneId) {
		try {
			await deleteTunnelDnsRecord(apiToken, zoneId, domain.host);
		} catch {
			// best-effort
		}
	}

	if (domain.cloudflareTunnelId) {
		try {
			await applyIngress(
				apiToken,
				accountId,
				domain.cloudflareTunnelId,
				(ingress) => removeIngressRule(ingress, domain.host),
			);
		} catch {
			// best-effort
		}
	}
};

/**
 * Removes all Cloudflare state for a domain (its route, plus the shared
 * connector/tunnel if it has no remaining routes). MUST be called BEFORE the
 * domain row is deleted so the stored tunnel/zone IDs are still available.
 * Best-effort and idempotent: individual failures never block deletion.
 */
export const deprovisionCloudflareForDomain = async (
	domain: Domain,
	options: DeprovisionOptions = {},
): Promise<void> => {
	if (!hasProvisionedState(domain)) {
		return;
	}
	await removeCloudflareRoute(domain, options);

	const tunnelId = domain.cloudflareTunnelId;
	if (!tunnelId) {
		return;
	}
	const integration = await findCloudflareById(
		domain.cloudflareId as string,
	).catch(() => null);
	if (!integration) {
		return;
	}

	// Tear down the shared connector + tunnel when nothing else uses it. Exclude
	// sibling rows being removed in the same bulk/cascade delete.
	try {
		const exclude = [domain.domainId, ...(options.alsoRemovingDomainIds ?? [])];
		const others = await db.query.domains.findMany({
			where: and(
				eq(domains.cloudflareTunnelId, tunnelId),
				eq(domains.publishToCloudflare, true),
				notInArray(domains.domainId, exclude),
			),
		});
		if (others.length === 0) {
			const runtime = await findRuntimeByTunnelId(
				integration.organizationId,
				tunnelId,
			);
			if (runtime) {
				await teardownSharedManagedTunnel(runtime, integration);
			}
		}
	} catch {
		// best-effort
	}
};

/**
 * Best-effort deprovision for a batch of domains being deleted together (the
 * FK-cascade delete of an application/compose/project). The whole batch is
 * excluded from the "still in use?" checks so a shared tunnel is torn down once
 * its last domain goes. Runs sequentially so the shared tunnel is only torn
 * down once (parallel runs would race the single teardown). Never throws —
 * logs each failure so orphaned external state stays traceable.
 */
export const deprovisionCloudflareForDomains = async (
	domainsToRemove: Domain[],
): Promise<void> => {
	const alsoRemovingDomainIds = domainsToRemove.map((d) => d.domainId);
	for (const domain of domainsToRemove) {
		try {
			await deprovisionCloudflareForDomain(domain, { alsoRemovingDomainIds });
		} catch (error) {
			console.error(
				"Failed to deprovision Cloudflare for domain %s (%s):",
				domain.domainId,
				domain.host,
				error,
			);
		}
	}
};

/**
 * True when a published Dokploy domain row already serves `host` — and, when a
 * `tunnelId` is given, serves it on THAT tunnel. A Dokploy-tagged DNS record /
 * tunnel route for such a host is ours (Dokploy allows several path-domains to
 * share one host on one tunnel), so it is safe to (re)use. The tunnel filter
 * mirrors provisioning, which only adopts a record on the same tunnel.
 */
const isHostTrackedByDokploy = async (
	host: string,
	tunnelId?: string | null,
): Promise<boolean> => {
	const rows = await db.query.domains.findMany({
		where: and(
			eq(domains.host, host),
			eq(domains.publishToCloudflare, true),
			...(tunnelId ? [eq(domains.cloudflareTunnelId, tunnelId)] : []),
		),
		columns: { domainId: true },
	});
	return rows.length > 0;
};

export interface DomainAvailability {
	available: boolean;
	reason?: string;
}

/**
 * Advisory, read-only pre-check for the UI: would publishing `host` through this
 * integration/tunnel collide with a Cloudflare DNS record or tunnel ingress route
 * that Dokploy does not own? The authoritative no-clobber guard runs inside
 * `provisionCloudflareForDomain` under the tunnel lock — this only surfaces the
 * likely outcome before the user submits, so it never mutates anything.
 */
export const checkCloudflareDomainAvailability = async (input: {
	apiToken: string;
	accountId: string;
	host: string;
	tunnelId?: string | null;
}): Promise<DomainAvailability> => {
	const { apiToken, accountId, host, tunnelId } = input;

	let zoneId: string;
	try {
		zoneId = await resolveZoneIdForHost(apiToken, host);
	} catch (error) {
		return {
			available: false,
			reason:
				error instanceof Error
					? error.message
					: `No Cloudflare zone in this account matches "${host}".`,
		};
	}

	// A host already served by a Dokploy domain row on this tunnel is ours to
	// (re)use; tracking is tunnel-aware so it matches what provisioning will adopt.
	const tracked = await isHostTrackedByDokploy(host, tunnelId);

	const record = await findDnsRecordByName(apiToken, zoneId, host);
	if (record) {
		if (record.comment !== DOKPLOY_DNS_COMMENT) {
			return {
				available: false,
				reason: `A DNS record for "${host}" already exists in Cloudflare and is not managed by Dokploy.`,
			};
		}
		if (!tracked) {
			return {
				available: false,
				reason: `A Dokploy-managed DNS record for "${host}" already exists (possibly on a different tunnel) and can't be reused here.`,
			};
		}
	}

	if (tunnelId && !tracked) {
		const config = await getTunnelConfiguration(apiToken, accountId, tunnelId);
		if (hasHostIngressRule(config.config?.ingress, host)) {
			return {
				available: false,
				reason: `"${host}" is already routed through the selected tunnel by a resource not managed by Dokploy.`,
			};
		}
	}

	return { available: true };
};
