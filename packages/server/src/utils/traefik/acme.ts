import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { encodeBase64 } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";

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

const acmeJsonPath = (isRemote: boolean) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths(isRemote);
	return path.join(DYNAMIC_TRAEFIK_PATH, "acme.json");
};

/**
 * Removes the ACME certificates for the given hosts and returns the hosts that
 * were actually removed. The caller is responsible for reloading Traefik:
 * acme.json is only read at startup, so an on-disk change has no effect until
 * the container restarts.
 */
export const purgeAcmeCertificates = async (
	hosts: string[],
	serverId?: string | null,
): Promise<string[]> => {
	if (hosts.length === 0) return [];

	const filePath = acmeJsonPath(!!serverId);

	let raw: string;
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`cat ${filePath} 2>/dev/null || true`,
		);
		raw = stdout;
	} else {
		if (!fs.existsSync(filePath)) return [];
		raw = fs.readFileSync(filePath, "utf8");
	}

	if (!raw.trim()) return [];

	let parsed: AcmeStore;
	try {
		parsed = JSON.parse(raw) as AcmeStore;
	} catch {
		// A malformed store is Traefik's to repair, not ours to overwrite.
		return [];
	}

	const { store, removed } = removeAcmeCertificates(parsed, hosts);
	if (removed.length === 0) return [];

	const serialized = JSON.stringify(store, null, 2);

	if (serverId) {
		// Traefik refuses to start if acme.json is more permissive than 0600.
		await execAsyncRemote(
			serverId,
			`echo "${encodeBase64(serialized)}" | base64 -d > ${filePath}; chmod 600 ${filePath}`,
		);
	} else {
		fs.writeFileSync(filePath, serialized, "utf8");
		fs.chmodSync(filePath, 0o600);
	}

	return removed;
};
