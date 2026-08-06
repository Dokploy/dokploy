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
 *
 * Never rejects. It runs inside the startup sequence, ahead of the backup cron
 * jobs, the restart notifications and the deployment worker, so a failure here
 * must not stop any of those from being brought up.
 */
export const initDomainTlsReconciliation = async () => {
	try {
		await reconcileDomainTls();
	} catch (error) {
		console.error("TLS reconciliation could not run:", error);
	}
};

const reconcileDomainTls = async () => {
	const domains = await findDomainsNeedingTlsReconciliation();
	if (domains.length === 0) return;

	const byApplication = new Map<string, typeof domains>();
	for (const domain of domains) {
		if (!domain.applicationId) continue;
		const bucket = byApplication.get(domain.applicationId) ?? [];
		bucket.push(domain);
		byApplication.set(domain.applicationId, bucket);
	}

	// Resolved once, up front, since both phases below need it: phase 1 to
	// regenerate routers, phase 2 to know which server each domain's
	// application lives on. An application that fails to resolve here is
	// excluded from both phases.
	const applications = new Map<
		string,
		Awaited<ReturnType<typeof findApplicationById>>
	>();
	for (const applicationId of byApplication.keys()) {
		try {
			applications.set(applicationId, await findApplicationById(applicationId));
		} catch (error) {
			console.error(
				`TLS reconciliation could not resolve application ${applicationId}:`,
				error,
			);
		}
	}

	// Phase 1: regenerate router configs written before the TLS override fix.
	for (const [applicationId, appDomains] of byApplication) {
		const application = applications.get(applicationId);
		if (!application) continue;

		try {
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

	// Phase 2: purge stale acme.json entries, independent of whether the
	// router for that domain still needed regeneration. A router already
	// carrying `tls: {}` is exactly the state `routerNeedsTlsFix` treats as
	// "nothing to do" in phase 1, so it is the only place left where a
	// certificate purge that was skipped or lost a race against Traefik on an
	// earlier boot gets retried. Grouped per server, not per application,
	// because acme.json is one file per server: this keeps the read/rewrite
	// and any remote SSH round trip to once per server for the whole pass.
	const byServer = new Map<string, typeof domains>();
	for (const domain of domains) {
		if (!domain.applicationId) continue;
		const application = applications.get(domain.applicationId);
		if (!application) continue;
		const serverKey = application.serverId ?? "";
		const bucket = byServer.get(serverKey) ?? [];
		bucket.push(domain);
		byServer.set(serverKey, bucket);
	}

	for (const [serverKey, serverDomains] of byServer) {
		const serverId = serverKey || undefined;
		try {
			// A host still served by another Let's Encrypt domain keeps its
			// certificate, exactly as the mutation path does.
			const hostToDomainId = new Map<string, string>();
			for (const domain of serverDomains) {
				if (!hostToDomainId.has(domain.host)) {
					hostToDomainId.set(domain.host, domain.domainId);
				}
			}

			const purgeableHosts: string[] = [];
			for (const [host, domainId] of hostToDomainId) {
				const stillInUse = await hasOtherLetsencryptDomainForHost(
					host,
					domainId,
				);
				if (!stillInUse) purgeableHosts.push(host);
			}

			if (purgeableHosts.length === 0) continue;

			const removed = await purgeAcmeCertificates(purgeableHosts, serverId);
			if (removed.length > 0) {
				await reloadDockerResource("dokploy-traefik", serverId);
			}
		} catch (error) {
			// One unreachable remote server must not stop the rest.
			console.error(
				`TLS reconciliation could not purge certificates for server ${serverKey || "local"}:`,
				error,
			);
		}
	}
};
