import { purgeAcmeCertificates } from "../utils/traefik/acme";
import { type Domain, hasOtherLetsencryptDomainForHost } from "./domain";

/**
 * Removes the Let's Encrypt certificate a domain no longer needs after it moved
 * away from the `letsencrypt` provider, and reports whether Traefik has to be
 * reloaded for the change to take effect.
 *
 * The host is kept when another domain record still serves it with
 * `certificateType: "letsencrypt"`, otherwise that domain would lose its
 * certificate. Failures are logged and reported as "no reload required": the
 * domain itself was already updated, so the caller must not fail because of a
 * best-effort cleanup.
 */
export const purgeStaleCertificate = async (
	domain: Domain,
	serverId?: string | null,
): Promise<boolean> => {
	if (domain.certificateType === "letsencrypt") return false;

	try {
		const stillInUse = await hasOtherLetsencryptDomainForHost(
			domain.host,
			domain.domainId,
		);
		if (stillInUse) return false;

		const removed = await purgeAcmeCertificates([domain.host], serverId);
		return removed.length > 0;
	} catch (error) {
		console.error(
			`Could not purge the stale ACME certificate for ${domain.host}:`,
			error,
		);
		return false;
	}
};
