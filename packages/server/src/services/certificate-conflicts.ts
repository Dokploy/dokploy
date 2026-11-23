import { X509Certificate } from "node:crypto";
import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	certificates,
	domains,
	forwardAuthSettings,
} from "@dokploy/server/db/schema";
import { eq, isNull } from "drizzle-orm";
import { execAsync, execAsyncRemote, sleep } from "../utils/process/execAsync";
import {
	acmeFilePath,
	getLetsEncryptHosts,
	readAcmeFile,
	withoutLetsEncryptHosts,
	writeAcmeFile,
} from "../utils/traefik/acme";
import { toPunycode } from "../utils/traefik/domain";
import { reloadDockerResource } from "./settings";
import { getWebServerSettings } from "./web-server-settings";

type ServedHost = {
	host: string;
	https: boolean;
	certificateType: "letsencrypt" | "none" | "custom";
	customCertResolver?: string | null;
	// Unset for the panel and SSO domains, which are server-wide settings
	organizationId?: string | null;
};

const TRAEFIK = "dokploy-traefik";
const PEM_BLOCK =
	/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

const normalize = (host: string) => toPunycode(host.trim()).toLowerCase();

const usesLetsEncrypt = (served: ServedHost) =>
	served.certificateType === "letsencrypt" ||
	(served.certificateType === "custom" &&
		served.customCertResolver === "letsencrypt");

const usesOtherResolver = (served: ServedHost) =>
	served.certificateType === "custom" &&
	!!served.customCertResolver &&
	served.customCertResolver !== "letsencrypt";

const coversHost = (certificateData: string, host: string, now: Date) =>
	(certificateData.match(PEM_BLOCK) ?? []).some((pem) => {
		try {
			const cert = new X509Certificate(pem);
			return (
				new Date(cert.validFrom) <= now &&
				now <= new Date(cert.validTo) &&
				cert.checkHost(host) !== undefined
			);
		} catch {
			return false;
		}
	});

// A leftover Let's Encrypt cert competes with the cert the host now uses, and often wins
export const getShadowedHosts = (input: {
	served: ServedHost[];
	uploadedCertificates: string[];
	letsEncryptHosts: string[];
	organizationId?: string;
	now?: Date;
}) => {
	const now = input.now ?? new Date();
	const inStore = new Set(input.letsEncryptHosts);
	const stillLetsEncrypt = new Set(
		input.served.filter(usesLetsEncrypt).map((s) => normalize(s.host)),
	);
	const shadowed = new Set<string>();
	for (const served of input.served) {
		if (!served.https || usesLetsEncrypt(served)) continue;
		if (
			input.organizationId &&
			served.organizationId &&
			served.organizationId !== input.organizationId
		) {
			continue;
		}
		const host = normalize(served.host);
		if (!inStore.has(host) || stillLetsEncrypt.has(host)) continue;
		if (
			usesOtherResolver(served) ||
			input.uploadedCertificates.some((cert) => coversHost(cert, host, now))
		) {
			shadowed.add(host);
		}
	}
	return [...shadowed];
};

const service = {
	columns: { serverId: true },
	with: {
		environment: {
			columns: {},
			with: { project: { columns: { organizationId: true } } },
		},
	},
} as const;

const domainOwner = {
	application: service,
	compose: service,
	previewDeployment: { columns: {}, with: { application: service } },
} as const;

type Service = {
	serverId: string | null;
	environment: { project: { organizationId: string } };
} | null;

const ownerService = (row?: {
	application: Service;
	compose: Service;
	previewDeployment: { application: Service } | null;
}) => row?.application ?? row?.compose ?? row?.previewDeployment?.application;

const ownerServerId = (row?: Parameters<typeof ownerService>[0]) =>
	ownerService(row)?.serverId ?? null;

const getServedHosts = async (serverId: string | null) => {
	const rows = await db.query.domains.findMany({
		where: eq(domains.enabled, true),
		columns: {
			host: true,
			https: true,
			certificateType: true,
			customCertResolver: true,
		},
		with: domainOwner,
	});
	const served: ServedHost[] = rows
		.filter((row) => ownerServerId(row) === serverId)
		.map((row) => ({
			...row,
			organizationId: ownerService(row)?.environment.project.organizationId,
		}));

	if (!serverId) {
		const panel = await getWebServerSettings();
		if (panel?.host) {
			served.push({
				host: panel.host,
				https: panel.https,
				certificateType: panel.certificateType,
			});
		}
	}

	const sso = await db.query.forwardAuthSettings.findFirst({
		where: serverId
			? eq(forwardAuthSettings.serverId, serverId)
			: isNull(forwardAuthSettings.serverId),
	});
	if (sso) {
		served.push({
			host: sso.authDomain,
			https: sso.https,
			certificateType: sso.certificateType,
			customCertResolver: sso.customCertResolver,
		});
	}
	return served;
};

export const findShadowedLetsEncryptHosts = async (
	serverId: string | null = null,
	organizationId?: string,
) => {
	// On Cloud the main server is Dokploy's own infrastructure
	if (IS_CLOUD && !serverId) return [];
	const served = await getServedHosts(serverId);
	const candidates = served.filter((s) => s.https && !usesLetsEncrypt(s));
	if (candidates.length === 0) return [];

	const uploaded = await db.query.certificates.findMany({
		where: serverId
			? eq(certificates.serverId, serverId)
			: isNull(certificates.serverId),
		columns: { certificateData: true },
	});
	if (uploaded.length === 0 && !candidates.some(usesOtherResolver)) return [];

	return getShadowedHosts({
		served,
		uploadedCertificates: uploaded.map((cert) => cert.certificateData),
		letsEncryptHosts: getLetsEncryptHosts(await readAcmeFile(serverId)),
		organizationId,
	});
};

// Used after saves; a failed check must never fail the save itself
export const findShadowedHostsSafely = async (
	serverId: string | null,
	filter: { host?: string; organizationId?: string },
) => {
	try {
		const hosts = await findShadowedLetsEncryptHosts(
			serverId,
			filter.organizationId,
		);
		return filter.host
			? hosts.filter((h) => h === normalize(filter.host ?? ""))
			: hosts;
	} catch (error) {
		console.error("Failed to check for certificate conflicts:", error);
		return [];
	}
};

export const findDomainCertificateConflicts = async (domain: {
	domainId: string;
	host: string;
	https: boolean;
	certificateType: ServedHost["certificateType"];
	customCertResolver?: string | null;
}) => {
	if (!domain.https || usesLetsEncrypt(domain)) return [];
	try {
		const serverId = await findDomainServerId(domain.domainId);
		return await findShadowedHostsSafely(serverId, { host: domain.host });
	} catch (error) {
		console.error("Failed to check for certificate conflicts:", error);
		return [];
	}
};

const findDomainServerId = async (domainId: string) => {
	const row = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
		columns: {},
		with: domainOwner,
	});
	return ownerServerId(row);
};

const isTraefikRunning = async (serverId: string | null) => {
	const command = `docker ps -q --filter status=running --filter name=^${TRAEFIK}`;
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);
	return stdout.trim() !== "";
};

const restartTraefik = async (serverId: string | null) => {
	await reloadDockerResource(TRAEFIK, serverId ?? undefined);
	for (let attempt = 0; attempt < 10; attempt++) {
		await sleep(1000);
		if (await isTraefikRunning(serverId)) return true;
	}
	return false;
};

// One fix per server at a time, including its background restart
const queues = new Map<string, Promise<void>>();

// Traefik loads acme.json only on start and rewrites it from memory, so restart right away
const restartAndVerify = async (
	serverId: string | null,
	hosts: string[],
	backup: string,
) => {
	if (!(await restartTraefik(serverId))) {
		await writeAcmeFile(backup, serverId);
		await restartTraefik(serverId);
		throw new Error("Traefik did not come back up; acme.json was restored");
	}
	const rewritten = withoutLetsEncryptHosts(
		await readAcmeFile(serverId),
		hosts,
	);
	if (rewritten) {
		await writeAcmeFile(rewritten, serverId);
		await restartTraefik(serverId);
	}
};

export const removeShadowedLetsEncryptCertificates = (
	serverId: string | null = null,
	organizationId?: string,
) => {
	const key = serverId ?? "";
	let release = () => {};
	const done = new Promise<void>((resolve) => {
		release = resolve;
	});
	const previous = queues.get(key) ?? Promise.resolve();
	queues.set(
		key,
		previous.then(() => done),
	);

	return previous.then(async () => {
		try {
			const hosts = await findShadowedLetsEncryptHosts(
				serverId,
				organizationId,
			);
			const original = hosts.length ? await readAcmeFile(serverId) : "";
			const updated = withoutLetsEncryptHosts(original, hosts);
			if (!updated) {
				release();
				return [];
			}

			await writeAcmeFile(original, serverId, `${acmeFilePath(serverId)}.bak`);
			await writeAcmeFile(updated, serverId);

			if (!(await isTraefikRunning(serverId))) {
				release();
				return hosts;
			}
			// In the background, since restarting Traefik drops requests routed through it
			void restartAndVerify(serverId, hosts, original)
				.catch((error) => console.error("Certificate conflict fix:", error))
				.finally(release);
			return hosts;
		} catch (error) {
			release();
			throw error;
		}
	});
};
