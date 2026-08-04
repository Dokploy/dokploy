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

const purgeChains = new Map<string, Promise<unknown>>();

/**
 * Runs purges for one server one at a time. A purge is a read-modify-write over
 * a file Traefik owns, so two concurrent calls for the same server would both
 * read the old store and the later write would resurrect whatever the earlier
 * one removed. Serialising in process is the practical boundary here, since a
 * server's acme.json is only ever written by the Dokploy instance managing it.
 */
const withPurgeLock = <T>(key: string, task: () => Promise<T>): Promise<T> => {
	const previous = purgeChains.get(key) ?? Promise.resolve();
	// Run whether or not the previous purge succeeded, otherwise one failure
	// would block every later purge for that server.
	const result = previous.then(task, task);
	purgeChains.set(
		key,
		result.then(
			() => undefined,
			() => undefined,
		),
	);
	return result;
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

	return withPurgeLock(serverId ?? "", () =>
		purgeAcmeCertificatesUnsynchronised(hosts, serverId),
	);
};

const purgeAcmeCertificatesUnsynchronised = async (
	hosts: string[],
	serverId?: string | null,
): Promise<string[]> => {
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

	// Never write in place: a truncated acme.json costs every Let's Encrypt
	// certificate on the server. Write a sibling temp file, lock it down to
	// 0600 (Traefik refuses to start on anything more permissive) and rename
	// it over the target, which is atomic within the same directory.
	const tempPath = `${filePath}.dokploy.tmp`;

	if (serverId) {
		await execAsyncRemote(
			serverId,
			`umask 077 && printf '%s' "${encodeBase64(serialized)}" | base64 -d > ${tempPath} && chmod 600 ${tempPath} && mv -f ${tempPath} ${filePath} || { rm -f ${tempPath}; exit 1; }`,
		);
	} else {
		try {
			fs.writeFileSync(tempPath, serialized, { encoding: "utf8", mode: 0o600 });
			// writeFileSync's mode is subject to the process umask, and it is
			// ignored entirely when the temp file already exists.
			fs.chmodSync(tempPath, 0o600);
			fs.renameSync(tempPath, filePath);
		} catch (error) {
			try {
				fs.unlinkSync(tempPath);
			} catch {
				// The temp file may never have been created.
			}
			throw error;
		}
	}

	return removed;
};
