import { createPrivateKey, type KeyObject, X509Certificate } from "node:crypto";
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
	getLetsEncryptCertificates,
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

type UploadedCertificate = { certificateData: string; privateKey: string };

const coversHost = (upload: UploadedCertificate, host: string, now: Date) => {
	let key: KeyObject;
	try {
		key = createPrivateKey(upload.privateKey);
	} catch {
		return false;
	}
	return (upload.certificateData.match(PEM_BLOCK) ?? []).some((pem) => {
		try {
			const cert = new X509Certificate(pem);
			return (
				new Date(cert.validFrom) <= now &&
				now <= new Date(cert.validTo) &&
				cert.checkHost(host) !== undefined &&
				cert.checkPrivateKey(key)
			);
		} catch {
			return false;
		}
	});
};

export const getShadowedHosts = (input: {
	served: ServedHost[];
	uploadedCertificates: UploadedCertificate[];
	letsEncryptCertificates: string[][];
	organizationId?: string;
	now?: Date;
}) => {
	const now = input.now ?? new Date();
	const inStore = new Set(input.letsEncryptCertificates.flat());
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

	return removableHosts(shadowed, input.letsEncryptCertificates);
};

const removableHosts = (hosts: Set<string>, certificates: string[][]) => {
	const removable = new Set(hosts);
	let changed = true;
	while (changed) {
		changed = false;
		for (const names of certificates) {
			if (
				names.some((n) => removable.has(n)) &&
				!names.every((n) => removable.has(n))
			) {
				for (const name of names) changed = removable.delete(name) || changed;
			}
		}
	}
	return [...removable];
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
	if (IS_CLOUD && !serverId) return [];
	const served = await getServedHosts(serverId);
	const candidates = served.filter((s) => s.https && !usesLetsEncrypt(s));
	if (candidates.length === 0) return [];

	const uploaded = await db.query.certificates.findMany({
		where: serverId
			? eq(certificates.serverId, serverId)
			: isNull(certificates.serverId),
		columns: { certificateData: true, privateKey: true },
	});
	if (uploaded.length === 0 && !candidates.some(usesOtherResolver)) return [];

	return getShadowedHosts({
		served,
		uploadedCertificates: uploaded,
		letsEncryptCertificates: getLetsEncryptCertificates(
			await readAcmeFile(serverId),
		),
		organizationId,
	});
};

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

const queues = new Map<string, Promise<void>>();

const restartOrRestore = async (serverId: string | null, backup: string) => {
	const restarted = await restartTraefik(serverId).catch((error) => {
		console.error("Traefik restart failed:", error);
		return false;
	});
	if (restarted) return;
	await writeAcmeFile(backup, serverId);
	await restartTraefik(serverId).catch(() => false);
	throw new Error("Traefik did not come back up; acme.json was restored");
};

const restartAndVerify = async (
	serverId: string | null,
	hosts: string[],
	backup: string,
) => {
	await restartOrRestore(serverId, backup);
	const rewritten = withoutLetsEncryptHosts(
		await readAcmeFile(serverId),
		hosts,
	);
	if (rewritten) {
		await writeAcmeFile(rewritten, serverId);
		await restartOrRestore(serverId, backup);
	}
};

export const removeShadowedLetsEncryptCertificates = (
	serverId: string | null,
	organizationId: string | undefined,
	confirmedHosts: string[],
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
			const confirmed = new Set(confirmedHosts.map(normalize));
			const shadowed = (
				await findShadowedLetsEncryptHosts(serverId, organizationId)
			).filter((host) => confirmed.has(host));
			const original = shadowed.length ? await readAcmeFile(serverId) : "";
			const hosts = removableHosts(
				new Set(shadowed),
				getLetsEncryptCertificates(original),
			);
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
			if (serverId) {
				await restartAndVerify(serverId, hosts, original).finally(release);
				return hosts;
			}
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
