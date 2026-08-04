import { findApplicationById } from "../services/application";
import {
	findDomainsNeedingTlsReconciliation,
	hasOtherLetsencryptDomainForHost,
} from "../services/domain";
import { reloadDockerResource } from "../services/settings";
import { purgeAcmeCertificates } from "../utils/traefik/acme";
import {
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
} from "../utils/traefik/application";
import { manageDomain } from "../utils/traefik/domain";
import type { FileConfig } from "../utils/traefik/file-types";

/**
 * A websecure router written before the TLS override fix has no `tls` key at
 * all, so Traefik applies the entrypoint's certResolver default to it.
 */
export const routerNeedsTlsFix = (
	config: FileConfig,
	appName: string,
	uniqueConfigKey: number,
): boolean => {
	const router =
		config.http?.routers?.[`${appName}-router-websecure-${uniqueConfigKey}`];
	if (!router) return false;
	return router.tls === undefined;
};

/**
 * One-shot pass that regenerates router configs written before the fix.
 * Idempotent: once a router carries `tls: {}` it is skipped on later starts.
 */
export const initDomainTlsReconciliation = async () => {
	const domains = await findDomainsNeedingTlsReconciliation();
	if (domains.length === 0) return;

	const reloadTargets = new Set<string>();

	const byApplication = new Map<string, typeof domains>();
	for (const domain of domains) {
		if (!domain.applicationId) continue;
		const bucket = byApplication.get(domain.applicationId) ?? [];
		bucket.push(domain);
		byApplication.set(domain.applicationId, bucket);
	}

	for (const [applicationId, appDomains] of byApplication) {
		try {
			const application = await findApplicationById(applicationId);
			const config = application.serverId
				? await loadOrCreateConfigRemote(
						application.serverId,
						application.appName,
					)
				: loadOrCreateConfig(application.appName);

			const stale = appDomains.filter((domain) =>
				routerNeedsTlsFix(config, application.appName, domain.uniqueConfigKey),
			);
			if (stale.length === 0) continue;

			// A host still served by another Let's Encrypt domain keeps its
			// certificate, exactly as the mutation path does.
			const purgeableHosts: string[] = [];
			for (const domain of stale) {
				const stillInUse = await hasOtherLetsencryptDomainForHost(
					domain.host,
					domain.domainId,
				);
				if (!stillInUse) purgeableHosts.push(domain.host);
			}

			// Purge before regenerating: once the router carries its `tls` key
			// `routerNeedsTlsFix` is false, so a purge that failed afterwards
			// would never be retried on a later boot.
			const removed =
				purgeableHosts.length > 0
					? await purgeAcmeCertificates(purgeableHosts, application.serverId)
					: [];
			if (removed.length > 0) {
				reloadTargets.add(application.serverId ?? "");
			}

			for (const domain of stale) {
				await manageDomain(application, domain);
			}

			console.log(
				`Reconciled TLS config for ${stale.length} domain(s) on ${application.appName}`,
			);
		} catch (error) {
			// One unreachable remote server must not stop the rest.
			console.error(
				`TLS reconciliation failed for application ${applicationId}:`,
				error,
			);
		}
	}

	for (const serverId of reloadTargets) {
		try {
			await reloadDockerResource("dokploy-traefik", serverId || undefined);
		} catch (error) {
			console.error("TLS reconciliation could not reload Traefik:", error);
		}
	}
};
