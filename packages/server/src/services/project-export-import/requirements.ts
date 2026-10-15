import { createHash, X509Certificate } from "node:crypto";
import { VAULT_REF_REGEX } from "@dokploy/server/utils/vault";
import type { ProjectTree, TransferDb } from "./queries";
import {
	buildUsedBy,
	scopedServices,
	type TaggedService,
} from "./service-kinds";
import type { ExportScope, Requirement, ServiceType, UsedBy } from "./types";

export const detectRequirements = async (
	db: TransferDb,
	tree: ProjectTree,
	scope: ExportScope,
): Promise<Requirement[]> => {
	const services = scopedServices(tree, scope);

	const [vault, destination, registry, network, certificate] =
		await Promise.all([
			detectVaultRequirements(db, tree, services, scope),
			detectDestinationRequirements(db, services, scope),
			detectRegistryRequirements(db, services, scope),
			detectNetworkRequirements(db, services, scope),
			detectCertificateRequirements(db, tree, services, scope),
		]);

	return [
		...vault,
		...detectGitProviderRequirements(services),
		...destination,
		...registry,
		...detectSshKeyRequirements(services, scope),
		...network,
		...certificate,
		...detectServerRequirements(services),
	];
};

const VAULT_TEXT_SOURCES: {
	field: string;
	pick: (service: Record<string, unknown>) => string | null | undefined;
}[] = [
	{ field: "env", pick: (s) => s.env as string | null },
	{ field: "buildArgs", pick: (s) => s.buildArgs as string | null },
	{ field: "buildSecrets", pick: (s) => s.buildSecrets as string | null },
	{ field: "previewEnv", pick: (s) => s.previewEnv as string | null },
];

const detectVaultRequirements = async (
	db: TransferDb,
	tree: ProjectTree,
	services: TaggedService[],
	scope: ExportScope,
): Promise<Requirement[]> => {
	const byProvider = new Map<
		string,
		{ secretKeys: Set<string>; usedBy: UsedBy[] }
	>();

	const record = (text: string | null | undefined, usedBy: UsedBy) => {
		if (!text) {
			return;
		}
		const keysByProvider = new Map<string, Set<string>>();
		for (const match of text.matchAll(VAULT_REF_REGEX)) {
			const providerName = match[1] as string;
			const secretKey = match[2] as string;
			const set = keysByProvider.get(providerName) ?? new Set<string>();
			set.add(secretKey);
			keysByProvider.set(providerName, set);
		}
		for (const [providerName, keys] of keysByProvider) {
			const entry = byProvider.get(providerName) ?? {
				secretKeys: new Set<string>(),
				usedBy: [] as UsedBy[],
			};
			for (const key of keys) {
				entry.secretKeys.add(key);
			}
			entry.usedBy.push(usedBy);
			byProvider.set(providerName, entry);
		}
	};

	record(tree.env, {
		serviceId: tree.projectId,
		serviceType: "project",
		serviceName: tree.name,
		environmentId: "",
		field: "env",
	});
	for (const env of tree.environments) {
		record(env.env, {
			serviceId: env.environmentId,
			serviceType: "environment",
			serviceName: env.name,
			environmentId: env.environmentId,
			field: "env",
		});
	}
	for (const { serviceType, environmentId, service } of services) {
		const serviceId = service[
			serviceType === "application" ? "applicationId" : `${serviceType}Id`
		] as string;
		const sources =
			serviceType === "application"
				? VAULT_TEXT_SOURCES
				: VAULT_TEXT_SOURCES.slice(0, 1);
		for (const source of sources) {
			record(
				source.pick(service),
				buildUsedBy(
					environmentId,
					serviceType,
					service,
					serviceId,
					source.field,
				),
			);
		}
	}

	if (byProvider.size === 0) {
		return [];
	}

	const providers = await db.query.vaultProvider.findMany({
		where: (fields, { eq }) => eq(fields.organizationId, tree.organizationId),
	});
	const providerByName = new Map(providers.map((p) => [p.name, p]));

	const configIncluded = scope.shared.vaultProvider === "value";

	const results: Requirement[] = [];
	for (const [providerName, entry] of byProvider) {
		const provider = providerByName.get(providerName);
		if (!provider) {
			continue;
		}
		results.push({
			kind: "vault",
			originalId: provider.vaultProviderId,
			providerName,
			providerType: provider.providerType,
			secretKeys: [...entry.secretKeys],
			configIncluded,
			usedBy: entry.usedBy,
		});
	}
	return results;
};

const GIT_PROVIDER_FIELDS = [
	{ idField: "githubId", providerType: "github" as const },
	{ idField: "gitlabId", providerType: "gitlab" as const },
	{ idField: "giteaId", providerType: "gitea" as const },
	{ idField: "bitbucketId", providerType: "bitbucket" as const },
];

const detectGitProviderRequirements = (
	services: TaggedService[],
): Requirement[] => {
	const byProviderId = new Map<
		string,
		{
			providerType: "github" | "gitlab" | "gitea" | "bitbucket";
			repositories: Map<string, { owner: string; repo: string }>;
			usedBy: UsedBy[];
		}
	>();

	for (const { serviceType, environmentId, service } of services) {
		if (serviceType !== "application" && serviceType !== "compose") {
			continue;
		}
		for (const { idField, providerType } of GIT_PROVIDER_FIELDS) {
			const providerId = service[idField] as string | null;
			if (!providerId) {
				continue;
			}
			const key = `${providerType}:${providerId}`;
			const entry = byProviderId.get(key) ?? {
				providerType,
				repositories: new Map<string, { owner: string; repo: string }>(),
				usedBy: [] as UsedBy[],
			};
			const owner = (service.owner as string | null) ?? "";
			const repo = (service.repository as string | null) ?? "";
			if (owner && repo) {
				entry.repositories.set(`${owner}/${repo}`, { owner, repo });
			}
			const serviceId = service[
				serviceType === "application" ? "applicationId" : "composeId"
			] as string;
			entry.usedBy.push(
				buildUsedBy(environmentId, serviceType, service, serviceId),
			);
			byProviderId.set(key, entry);
		}
	}

	return [...byProviderId.entries()].map(([key, entry]) => ({
		kind: "gitProvider" as const,
		originalId: key.split(":")[1] as string,
		providerType: entry.providerType,
		repositories: [...entry.repositories.values()],
		configIncluded: false,
		usedBy: entry.usedBy,
	}));
};

const detectDestinationRequirements = async (
	db: TransferDb,
	services: TaggedService[],
	scope: ExportScope,
): Promise<Requirement[]> => {
	const usedByPerId = new Map<string, UsedBy[]>();

	for (const { serviceType, environmentId, service } of services) {
		const children = [
			...((service.backups as Record<string, unknown>[] | undefined) ?? []),
			...((service.volumeBackups as Record<string, unknown>[] | undefined) ??
				[]),
		];
		const serviceId = service[
			serviceType === "application" ? "applicationId" : `${serviceType}Id`
		] as string;
		for (const child of children) {
			const destinationId = child.destinationId as string | null;
			if (!destinationId) {
				continue;
			}
			const list = usedByPerId.get(destinationId) ?? [];
			list.push(buildUsedBy(environmentId, serviceType, service, serviceId));
			usedByPerId.set(destinationId, list);
		}
	}

	if (usedByPerId.size === 0) {
		return [];
	}

	const ids = [...usedByPerId.keys()];
	const rows = await db.query.destinations.findMany({
		where: (fields, { inArray }) => inArray(fields.destinationId, ids),
	});
	const configIncluded = scope.shared.destination === "value";

	return rows.map((row) => ({
		kind: "destination" as const,
		originalId: row.destinationId,
		bucket: row.bucket,
		endpoint: row.endpoint,
		region: row.region,
		configIncluded,
		usedBy: usedByPerId.get(row.destinationId) ?? [],
	}));
};

const REGISTRY_FIELDS = [
	{ idField: "registryId", role: "registry" as const },
	{ idField: "buildRegistryId", role: "buildRegistry" as const },
	{ idField: "rollbackRegistryId", role: "rollbackRegistry" as const },
];

const detectRegistryRequirements = async (
	db: TransferDb,
	services: TaggedService[],
	scope: ExportScope,
): Promise<Requirement[]> => {
	const byRegistryId = new Map<
		string,
		{
			roles: Set<"registry" | "buildRegistry" | "rollbackRegistry">;
			usedBy: UsedBy[];
		}
	>();

	for (const { serviceType, environmentId, service } of services) {
		if (serviceType !== "application") {
			continue;
		}
		const serviceId = service.applicationId as string;
		for (const { idField, role } of REGISTRY_FIELDS) {
			const registryId = service[idField] as string | null;
			if (!registryId) {
				continue;
			}
			const entry = byRegistryId.get(registryId) ?? {
				roles: new Set<"registry" | "buildRegistry" | "rollbackRegistry">(),
				usedBy: [] as UsedBy[],
			};
			entry.roles.add(role);
			entry.usedBy.push(
				buildUsedBy(environmentId, serviceType, service, serviceId, idField),
			);
			byRegistryId.set(registryId, entry);
		}
	}

	if (byRegistryId.size === 0) {
		return [];
	}

	const ids = [...byRegistryId.keys()];
	const rows = await db.query.registry.findMany({
		where: (fields, { inArray }) => inArray(fields.registryId, ids),
	});
	const configIncluded = scope.shared.registry === "value";

	return rows.map((row) => {
		const entry = byRegistryId.get(row.registryId);
		return {
			kind: "registry" as const,
			originalId: row.registryId,
			registryUrl: row.registryUrl,
			imagePrefix: row.imagePrefix ?? "",
			role: [...(entry?.roles ?? [])],
			configIncluded,
			usedBy: entry?.usedBy ?? [],
		};
	});
};

const detectSshKeyRequirements = (
	services: TaggedService[],
	scope: ExportScope,
): Requirement[] => {
	const bySshKeyId = new Map<string, { publicKey: string; usedBy: UsedBy[] }>();

	for (const { serviceType, environmentId, service } of services) {
		if (serviceType !== "application" && serviceType !== "compose") {
			continue;
		}
		const sshKeyId = service.customGitSSHKeyId as string | null;
		if (!sshKeyId) {
			continue;
		}
		const publicKey =
			((service.customGitSSHKey as Record<string, unknown> | null)?.publicKey as
				| string
				| undefined) ?? "";
		const entry = bySshKeyId.get(sshKeyId) ?? {
			publicKey,
			usedBy: [] as UsedBy[],
		};
		const serviceId = service[
			serviceType === "application" ? "applicationId" : "composeId"
		] as string;
		entry.usedBy.push(
			buildUsedBy(environmentId, serviceType, service, serviceId),
		);
		bySshKeyId.set(sshKeyId, entry);
	}

	const configIncluded = scope.shared.sshKey === "value";
	return [...bySshKeyId.entries()].map(([sshKeyId, entry]) => ({
		kind: "sshKey" as const,
		originalId: sshKeyId,
		publicKey: entry.publicKey,
		configIncluded,
		usedBy: entry.usedBy,
	}));
};

const detectNetworkRequirements = async (
	db: TransferDb,
	services: TaggedService[],
	scope: ExportScope,
): Promise<Requirement[]> => {
	const usedByPerId = new Map<string, UsedBy[]>();

	for (const { serviceType, environmentId, service } of services) {
		const networkIds = (service.networkIds as string[] | null) ?? [];
		const serviceId = service[
			serviceType === "application" ? "applicationId" : `${serviceType}Id`
		] as string;
		for (const networkId of networkIds) {
			const list = usedByPerId.get(networkId) ?? [];
			list.push(buildUsedBy(environmentId, serviceType, service, serviceId));
			usedByPerId.set(networkId, list);
		}
	}

	if (usedByPerId.size === 0) {
		return [];
	}

	const ids = [...usedByPerId.keys()];
	const rows = await db.query.network.findMany({
		where: (fields, { inArray }) => inArray(fields.networkId, ids),
	});
	const configIncluded = scope.shared.network === "value";

	return rows.map((row) => ({
		kind: "network" as const,
		originalId: row.networkId,
		name: row.name,
		configIncluded,
		usedBy: usedByPerId.get(row.networkId) ?? [],
	}));
};

const detectCertificateRequirements = async (
	db: TransferDb,
	tree: ProjectTree,
	services: TaggedService[],
	scope: ExportScope,
): Promise<Requirement[]> => {
	const httpsDomains: {
		host: string;
		serverId: string | null;
		usedBy: UsedBy;
	}[] = [];
	for (const { serviceType, environmentId, service } of services) {
		const domains =
			(service.domains as Record<string, unknown>[] | undefined) ?? [];
		const serviceId = service[
			serviceType === "application" ? "applicationId" : `${serviceType}Id`
		] as string;
		for (const domain of domains) {
			// Uploaded certificates are picked by Traefik through SNI, so these domains use certificateType "none".
			if (!domain.https || domain.certificateType !== "none") continue;
			httpsDomains.push({
				host: domain.host as string,
				serverId: (service.serverId as string | null) ?? null,
				usedBy: buildUsedBy(
					environmentId,
					serviceType,
					service,
					serviceId,
					`domain:${domain.domainId}`,
				),
			});
		}
	}

	if (httpsDomains.length === 0) {
		return [];
	}

	const rows = await db.query.certificates.findMany({
		where: (fields, { eq }) => eq(fields.organizationId, tree.organizationId),
	});
	const configIncluded = scope.shared.certificate === "value";

	return rows.flatMap((row) => {
		let certificate: X509Certificate;
		try {
			certificate = new X509Certificate(row.certificateData);
		} catch {
			return [];
		}
		const usedBy = httpsDomains
			.filter(
				(domain) =>
					domain.serverId === (row.serverId ?? null) &&
					certificate.checkHost(domain.host) !== undefined,
			)
			.map((domain) => domain.usedBy);
		if (usedBy.length === 0) return [];
		return [
			{
				kind: "certificate" as const,
				originalId: row.certificateId,
				fingerprint: createHash("sha256")
					.update(row.certificateData)
					.digest("hex"),
				configIncluded,
				usedBy,
				serverId: row.serverId ?? null,
			},
		];
	});
};

const detectServerRequirements = (services: TaggedService[]): Requirement[] => {
	const byServerId = new Map<string, UsedBy[]>();

	const record = (
		serverId: string | null,
		environmentId: string,
		serviceType: ServiceType,
		service: Record<string, unknown>,
		serviceId: string,
		field?: string,
	) => {
		const key = serverId ?? "";
		const list = byServerId.get(key) ?? [];
		list.push(
			buildUsedBy(environmentId, serviceType, service, serviceId, field),
		);
		byServerId.set(key, list);
	};

	for (const { serviceType, environmentId, service } of services) {
		const serviceId = service[
			serviceType === "application" ? "applicationId" : `${serviceType}Id`
		] as string;
		record(
			(service.serverId as string | null) ?? null,
			environmentId,
			serviceType,
			service,
			serviceId,
			"serverId",
		);
		if (serviceType === "application" && service.buildServerId) {
			record(
				service.buildServerId as string,
				environmentId,
				serviceType,
				service,
				serviceId,
				"buildServerId",
			);
		}
	}

	return [...byServerId.entries()].map(([serverId, usedBy]) => ({
		kind: "server" as const,
		originalId: serverId === "" ? null : serverId,
		configIncluded: false,
		usedBy,
	}));
};
