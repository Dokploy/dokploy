export interface AcmeCertificate {
	domain: { main: string; sans?: string[] };
	certificate: string;
	key: string;
	Store?: string;
}

export interface AcmeResolver {
	Account?: unknown;
	Certificates?: AcmeCertificate[] | null;
}

export type AcmeStore = Record<string, AcmeResolver>;

/**
 * Returns a copy of the ACME store with the certificates for the given hosts
 * removed. The Account object of each resolver is preserved, so Traefik keeps
 * its ACME registration.
 */
export const removeAcmeCertificates = (
	store: AcmeStore,
	hosts: string[],
): { store: AcmeStore; removed: string[] } => {
	const targets = new Set(hosts);
	const removed: string[] = [];
	const next: AcmeStore = {};

	for (const [resolverName, resolver] of Object.entries(store)) {
		const certificates = resolver.Certificates ?? [];
		const kept: AcmeCertificate[] = [];

		for (const certificate of certificates) {
			if (targets.has(certificate.domain.main)) {
				removed.push(certificate.domain.main);
			} else {
				kept.push(certificate);
			}
		}

		next[resolverName] = { ...resolver, Certificates: kept };
	}

	return { store: next, removed };
};
