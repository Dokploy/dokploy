import { db } from "@dokploy/server/db";
import {
	applications,
	backups,
	bitbucket,
	certificates,
	compose,
	destinations,
	environments,
	gitea,
	github,
	gitlab,
	gitProvider,
	libsql,
	mariadb,
	member,
	mongo,
	mysql,
	network,
	organization,
	postgres,
	projects,
	projectTags,
	redis,
	registry,
	schedules,
	server,
	sshKeys,
	tags,
	vaultProvider,
	volumeBackups,
} from "@dokploy/server/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const privilegedOrganizationRoles = new Set(["owner", "admin"]);

const resourceKinds = [
	"servers",
	"registries",
	"sshKeys",
	"gitProviders",
	"networks",
	"schedules",
	"destinations",
	"vaultProviders",
	"certificates",
] as const;

export type ProjectTransferResourceKind = (typeof resourceKinds)[number];

export type ProjectTransferBlocker = {
	code:
		| "SOURCE_ACCESS_REQUIRED"
		| "TARGET_ACCESS_REQUIRED"
		| "TARGET_NOT_FOUND"
		| "SAME_ORGANIZATION"
		| "PROJECT_NOT_FOUND"
		| "SHARED_RESOURCE"
		| "RESOURCE_NOT_FOUND"
		| "RESOURCE_OWNERSHIP_CONFLICT";
	message: string;
	resourceKind?: ProjectTransferResourceKind;
	resourceIds?: string[];
};

export type ProjectTransferDependency = {
	kind: ProjectTransferResourceKind;
	count: number;
	ids: string[];
};

export type ProjectTransferPlan = {
	projectId: string;
	projectName: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	environmentCount: number;
	tagNames: string[];
	serviceCount: number;
	dependencies: ProjectTransferDependency[];
	blockers: ProjectTransferBlocker[];
	warnings: string[];
	canTransfer: boolean;
};

export class ProjectTransferError extends Error {
	constructor(
		readonly code:
			| "PROJECT_NOT_FOUND"
			| "TARGET_NOT_FOUND"
			| "TRANSFER_BLOCKED",
		message: string,
	) {
		super(message);
		this.name = "ProjectTransferError";
	}
}

type DatabaseLike = Pick<typeof db, "select" | "update" | "insert" | "delete">;

type ServiceReference = {
	projectId: string;
	serviceId: string;
	serviceType: "application" | "compose" | "database";
	serverIds: string[];
	registryIds: string[];
	sshKeyIds: string[];
	providerChildIds: string[];
	networkIds: string[];
};

type DependencyIds = Record<ProjectTransferResourceKind, Set<string>>;

type ProjectTransferState = {
	projectId: string;
	projectName: string;
	environmentIds: string[];
	tagNames: string[];
	serviceReferences: ServiceReference[];
	dependencyIds: DependencyIds;
};

type ProviderMap = Map<string, string>;

const emptyDependencyIds = (): DependencyIds => ({
	servers: new Set(),
	registries: new Set(),
	sshKeys: new Set(),
	gitProviders: new Set(),
	networks: new Set(),
	schedules: new Set(),
	destinations: new Set(),
	vaultProviders: new Set(),
	certificates: new Set(),
});

const nonEmpty = (value: string | null | undefined): value is string => !!value;

const providerMap = async (database: DatabaseLike): Promise<ProviderMap> => {
	const [githubRows, gitlabRows, bitbucketRows, giteaRows] = await Promise.all([
		database
			.select({ childId: github.githubId, providerId: github.gitProviderId })
			.from(github),
		database
			.select({ childId: gitlab.gitlabId, providerId: gitlab.gitProviderId })
			.from(gitlab),
		database
			.select({
				childId: bitbucket.bitbucketId,
				providerId: bitbucket.gitProviderId,
			})
			.from(bitbucket),
		database
			.select({ childId: gitea.giteaId, providerId: gitea.gitProviderId })
			.from(gitea),
	]);

	return new Map(
		[...githubRows, ...gitlabRows, ...bitbucketRows, ...giteaRows].map(
			(row) => [row.childId, row.providerId],
		),
	);
};

const loadServiceReferences = async (
	database: DatabaseLike,
): Promise<ServiceReference[]> => {
	const [
		applicationRows,
		composeRows,
		libsqlRows,
		mariadbRows,
		mongoRows,
		mysqlRows,
		postgresRows,
		redisRows,
	] = await Promise.all([
		database
			.select({
				projectId: projects.projectId,
				serviceId: applications.applicationId,
				serverId: applications.serverId,
				buildServerId: applications.buildServerId,
				registryId: applications.registryId,
				buildRegistryId: applications.buildRegistryId,
				rollbackRegistryId: applications.rollbackRegistryId,
				sshKeyId: applications.customGitSSHKeyId,
				githubId: applications.githubId,
				gitlabId: applications.gitlabId,
				bitbucketId: applications.bitbucketId,
				giteaId: applications.giteaId,
				networkIds: applications.networkIds,
			})
			.from(applications)
			.innerJoin(
				environments,
				eq(applications.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: compose.composeId,
				serverId: compose.serverId,
				sshKeyId: compose.customGitSSHKeyId,
				githubId: compose.githubId,
				gitlabId: compose.gitlabId,
				bitbucketId: compose.bitbucketId,
				giteaId: compose.giteaId,
				serviceNetworks: compose.serviceNetworks,
			})
			.from(compose)
			.innerJoin(
				environments,
				eq(compose.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: libsql.libsqlId,
				serverId: libsql.serverId,
				networkIds: libsql.networkIds,
			})
			.from(libsql)
			.innerJoin(
				environments,
				eq(libsql.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: mariadb.mariadbId,
				serverId: mariadb.serverId,
				networkIds: mariadb.networkIds,
			})
			.from(mariadb)
			.innerJoin(
				environments,
				eq(mariadb.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: mongo.mongoId,
				serverId: mongo.serverId,
				networkIds: mongo.networkIds,
			})
			.from(mongo)
			.innerJoin(
				environments,
				eq(mongo.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: mysql.mysqlId,
				serverId: mysql.serverId,
				networkIds: mysql.networkIds,
			})
			.from(mysql)
			.innerJoin(
				environments,
				eq(mysql.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: postgres.postgresId,
				serverId: postgres.serverId,
				networkIds: postgres.networkIds,
			})
			.from(postgres)
			.innerJoin(
				environments,
				eq(postgres.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
		database
			.select({
				projectId: projects.projectId,
				serviceId: redis.redisId,
				serverId: redis.serverId,
				networkIds: redis.networkIds,
			})
			.from(redis)
			.innerJoin(
				environments,
				eq(redis.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId)),
	]);

	const providers = await providerMap(database);
	const result: ServiceReference[] = [];

	for (const row of applicationRows) {
		result.push({
			projectId: row.projectId,
			serviceId: row.serviceId,
			serviceType: "application",
			serverIds: [row.serverId, row.buildServerId].filter(nonEmpty),
			registryIds: [
				row.registryId,
				row.buildRegistryId,
				row.rollbackRegistryId,
			].filter(nonEmpty),
			sshKeyIds: [row.sshKeyId].filter(nonEmpty),
			providerChildIds: [
				row.githubId,
				row.gitlabId,
				row.bitbucketId,
				row.giteaId,
			].filter(nonEmpty),
			networkIds: row.networkIds ?? [],
		});
	}

	for (const row of composeRows) {
		result.push({
			projectId: row.projectId,
			serviceId: row.serviceId,
			serviceType: "compose",
			serverIds: [row.serverId].filter(nonEmpty),
			registryIds: [],
			sshKeyIds: [row.sshKeyId].filter(nonEmpty),
			providerChildIds: [
				row.githubId,
				row.gitlabId,
				row.bitbucketId,
				row.giteaId,
			].filter(nonEmpty),
			networkIds: (row.serviceNetworks ?? []).flatMap(
				(networkEntry) => networkEntry.networkIds,
			),
		});
	}

	for (const rows of [
		libsqlRows,
		mariadbRows,
		mongoRows,
		mysqlRows,
		postgresRows,
		redisRows,
	]) {
		for (const row of rows) {
			result.push({
				projectId: row.projectId,
				serviceId: row.serviceId,
				serviceType: "database",
				serverIds: [row.serverId].filter(nonEmpty),
				registryIds: [],
				sshKeyIds: [],
				providerChildIds: [],
				networkIds: row.networkIds ?? [],
			});
		}
	}

	// Resolve provider child records to their organization-scoped parent.
	return result.map((reference) => ({
		...reference,
		providerChildIds: reference.providerChildIds
			.map((childId) => providers.get(childId))
			.filter(nonEmpty),
	}));
};

const collectServiceDependencies = (
	references: ServiceReference[],
	projectId: string,
): DependencyIds => {
	const dependencies = emptyDependencyIds();
	const projectReferences = references.filter(
		(reference) => reference.projectId === projectId,
	);

	for (const reference of projectReferences) {
		for (const id of reference.serverIds) dependencies.servers.add(id);
		for (const id of reference.registryIds) dependencies.registries.add(id);
		for (const id of reference.sshKeyIds) dependencies.sshKeys.add(id);
		for (const id of reference.providerChildIds)
			dependencies.gitProviders.add(id);
		for (const id of reference.networkIds) dependencies.networks.add(id);
	}

	return dependencies;
};

const collectLinkedDependencies = async (
	database: DatabaseLike,
	projectId: string,
	references: ServiceReference[],
	dependencies: DependencyIds,
) => {
	const projectReferences = references.filter(
		(reference) => reference.projectId === projectId,
	);
	const applicationIds = projectReferences
		.filter((reference) => reference.serviceType === "application")
		.map((reference) => reference.serviceId);
	const composeIds = projectReferences
		.filter((reference) => reference.serviceType === "compose")
		.map((reference) => reference.serviceId);
	const databaseIds = projectReferences
		.filter((reference) => reference.serviceType === "database")
		.map((reference) => reference.serviceId);

	const [scheduleRows, backupRows, volumeBackupRows, vaultRows] =
		await Promise.all([
			database
				.select({
					scheduleId: schedules.scheduleId,
					applicationId: schedules.applicationId,
					composeId: schedules.composeId,
					organizationId: schedules.organizationId,
				})
				.from(schedules),
			database
				.select({
					destinationId: backups.destinationId,
					applicationId: backups.postgresId,
					composeId: backups.composeId,
					serviceIds: sql<
						string[]
					>`array_remove(array[${backups.postgresId}, ${backups.mariadbId}, ${backups.mysqlId}, ${backups.mongoId}, ${backups.libsqlId}]::text[], null)`,
				})
				.from(backups),
			database
				.select({
					destinationId: volumeBackups.destinationId,
					applicationId: volumeBackups.applicationId,
					composeId: volumeBackups.composeId,
					serviceIds: sql<
						string[]
					>`array_remove(array[${volumeBackups.applicationId}, ${volumeBackups.postgresId}, ${volumeBackups.mariadbId}, ${volumeBackups.mongoId}, ${volumeBackups.mysqlId}, ${volumeBackups.redisId}, ${volumeBackups.libsqlId}]::text[], null)`,
				})
				.from(volumeBackups),
			database
				.select({
					vaultProviderId: vaultProvider.vaultProviderId,
					assignments: vaultProvider.assignments,
				})
				.from(vaultProvider),
		]);

	const projectServiceIds = new Set([
		...applicationIds,
		...composeIds,
		...databaseIds,
	]);

	for (const row of scheduleRows) {
		if (
			(applicationIds.includes(row.applicationId ?? "") ||
				composeIds.includes(row.composeId ?? "")) &&
			row.scheduleId
		) {
			dependencies.schedules.add(row.scheduleId);
		}
	}

	for (const row of [...backupRows, ...volumeBackupRows]) {
		const serviceIds = [
			row.applicationId,
			row.composeId,
			...(("serviceIds" in row ? row.serviceIds : []) ?? []),
		].filter(nonEmpty);
		if (serviceIds.some((serviceId) => projectServiceIds.has(serviceId))) {
			dependencies.destinations.add(row.destinationId);
		}
	}

	for (const row of vaultRows) {
		if (
			row.assignments.some((assignment) => assignment.projectId === projectId)
		) {
			dependencies.vaultProviders.add(row.vaultProviderId);
		}
	}
};

const addServerLinkedResources = async (
	database: DatabaseLike,
	dependencies: DependencyIds,
) => {
	const serverIds = [...dependencies.servers];
	if (serverIds.length === 0) return;

	const [serverRows, certificateRows, networkRows] = await Promise.all([
		database
			.select({ serverId: server.serverId, sshKeyId: server.sshKeyId })
			.from(server)
			.where(inArray(server.serverId, serverIds)),
		database
			.select({ certificateId: certificates.certificateId })
			.from(certificates)
			.where(inArray(certificates.serverId, serverIds)),
		database
			.select({ networkId: network.networkId })
			.from(network)
			.where(inArray(network.serverId, serverIds)),
	]);

	for (const row of serverRows) {
		if (row.sshKeyId) dependencies.sshKeys.add(row.sshKeyId);
	}
	for (const row of certificateRows)
		dependencies.certificates.add(row.certificateId);
	for (const row of networkRows) dependencies.networks.add(row.networkId);
};

const loadProjectState = async (
	database: DatabaseLike,
	projectId: string,
	sourceOrganizationId: string,
): Promise<ProjectTransferState | null> => {
	const projectRows = await database
		.select({ projectId: projects.projectId, name: projects.name })
		.from(projects)
		.where(
			and(
				eq(projects.projectId, projectId),
				eq(projects.organizationId, sourceOrganizationId),
			),
		)
		.limit(1);
	if (!projectRows[0]) return null;

	const [environmentRows, tagRows, references] = await Promise.all([
		database
			.select({ environmentId: environments.environmentId })
			.from(environments)
			.where(eq(environments.projectId, projectId)),
		database
			.select({ name: tags.name })
			.from(projectTags)
			.innerJoin(tags, eq(projectTags.tagId, tags.tagId))
			.where(eq(projectTags.projectId, projectId)),
		loadServiceReferences(database),
	]);

	const dependencyIds = collectServiceDependencies(references, projectId);
	await collectLinkedDependencies(
		database,
		projectId,
		references,
		dependencyIds,
	);
	await addServerLinkedResources(database, dependencyIds);

	return {
		projectId,
		projectName: projectRows[0].name,
		environmentIds: environmentRows.map((row) => row.environmentId),
		tagNames: tagRows.map((row) => row.name),
		serviceReferences: references,
		dependencyIds,
	};
};

const dependencyEntries = (
	dependencies: DependencyIds,
): ProjectTransferDependency[] =>
	resourceKinds
		.map((kind) => ({
			kind,
			ids: [...dependencies[kind]],
			count: dependencies[kind].size,
		}))
		.filter((dependency) => dependency.count > 0);

const idsUsedOutsideProject = (
	references: ServiceReference[],
	projectId: string,
	kind: "servers" | "registries" | "sshKeys" | "gitProviders" | "networks",
	ids: Set<string>,
) => {
	const result = new Set<string>();
	for (const reference of references) {
		if (reference.projectId === projectId) continue;
		const values =
			kind === "servers"
				? reference.serverIds
				: kind === "registries"
					? reference.registryIds
					: kind === "sshKeys"
						? reference.sshKeyIds
						: kind === "gitProviders"
							? reference.providerChildIds
							: reference.networkIds;
		for (const id of values) if (ids.has(id)) result.add(id);
	}
	return result;
};

const sharedLinkedResources = async (
	database: DatabaseLike,
	projectId: string,
	state: ProjectTransferState,
) => {
	const shared = new Map<ProjectTransferResourceKind, Set<string>>();
	const add = (kind: ProjectTransferResourceKind, ids: Set<string>) => {
		if (ids.size > 0) shared.set(kind, ids);
	};

	add(
		"servers",
		idsUsedOutsideProject(
			state.serviceReferences,
			projectId,
			"servers",
			state.dependencyIds.servers,
		),
	);
	add(
		"registries",
		idsUsedOutsideProject(
			state.serviceReferences,
			projectId,
			"registries",
			state.dependencyIds.registries,
		),
	);
	add(
		"sshKeys",
		idsUsedOutsideProject(
			state.serviceReferences,
			projectId,
			"sshKeys",
			state.dependencyIds.sshKeys,
		),
	);
	add(
		"gitProviders",
		idsUsedOutsideProject(
			state.serviceReferences,
			projectId,
			"gitProviders",
			state.dependencyIds.gitProviders,
		),
	);
	add(
		"networks",
		idsUsedOutsideProject(
			state.serviceReferences,
			projectId,
			"networks",
			state.dependencyIds.networks,
		),
	);

	const [
		serverRows,
		providerRows,
		scheduleRows,
		backupRows,
		volumeBackupRows,
		vaultRows,
	] = await Promise.all([
		database
			.select({ serverId: server.serverId, sshKeyId: server.sshKeyId })
			.from(server)
			.where(inArray(server.sshKeyId, [...state.dependencyIds.sshKeys])),
		database
			.select({
				gitProviderId: gitProvider.gitProviderId,
				sharedWithOrganization: gitProvider.sharedWithOrganization,
			})
			.from(gitProvider)
			.where(
				inArray(gitProvider.gitProviderId, [
					...state.dependencyIds.gitProviders,
				]),
			),
		database
			.select({
				scheduleId: schedules.scheduleId,
				applicationId: schedules.applicationId,
				composeId: schedules.composeId,
			})
			.from(schedules),
		database
			.select({
				destinationId: backups.destinationId,
				serviceIds: sql<
					string[]
				>`array_remove(array[${backups.postgresId}, ${backups.mariadbId}, ${backups.mysqlId}, ${backups.mongoId}, ${backups.libsqlId}, ${backups.composeId}]::text[], null)`,
			})
			.from(backups),
		database
			.select({
				destinationId: volumeBackups.destinationId,
				serviceIds: sql<
					string[]
				>`array_remove(array[${volumeBackups.applicationId}, ${volumeBackups.postgresId}, ${volumeBackups.mariadbId}, ${volumeBackups.mongoId}, ${volumeBackups.mysqlId}, ${volumeBackups.redisId}, ${volumeBackups.libsqlId}, ${volumeBackups.composeId}]::text[], null)`,
			})
			.from(volumeBackups),
		database
			.select({
				vaultProviderId: vaultProvider.vaultProviderId,
				assignments: vaultProvider.assignments,
			})
			.from(vaultProvider),
	]);

	const otherServerKeys = new Set(
		serverRows
			.filter((row) => !state.dependencyIds.servers.has(row.serverId))
			.map((row) => row.sshKeyId)
			.filter(nonEmpty),
	);
	add(
		"sshKeys",
		new Set(
			[...state.dependencyIds.sshKeys].filter((id) => otherServerKeys.has(id)),
		),
	);

	add(
		"gitProviders",
		new Set(
			providerRows
				.filter((row) => row.sharedWithOrganization)
				.map((row) => row.gitProviderId),
		),
	);

	const serviceProjectIds = new Map(
		state.serviceReferences.map((reference) => [
			reference.serviceId,
			reference.projectId,
		]),
	);
	const destinationShared = new Set<string>();
	for (const row of [...backupRows, ...volumeBackupRows]) {
		const projectsUsingDestination = row.serviceIds
			.map((serviceId) => serviceProjectIds.get(serviceId))
			.filter(nonEmpty);
		if (projectsUsingDestination.some((id) => id !== projectId)) {
			destinationShared.add(row.destinationId);
		}
	}
	add("destinations", destinationShared);

	const projectSchedules = new Set(state.dependencyIds.schedules);
	const scheduleShared = new Set(
		scheduleRows
			.filter((row) => projectSchedules.has(row.scheduleId))
			.filter(
				(row) =>
					(row.applicationId &&
						serviceProjectIds.get(row.applicationId) !== projectId) ||
					(row.composeId && serviceProjectIds.get(row.composeId) !== projectId),
			)
			.map((row) => row.scheduleId),
	);
	add("schedules", scheduleShared);

	const vaultShared = new Set<string>();
	for (const row of vaultRows) {
		if (!state.dependencyIds.vaultProviders.has(row.vaultProviderId)) continue;
		if (
			row.assignments.some((assignment) => assignment.projectId !== projectId)
		) {
			vaultShared.add(row.vaultProviderId);
		}
	}
	add("vaultProviders", vaultShared);

	return shared;
};

const resourceOwners = async (
	database: DatabaseLike,
	dependencies: DependencyIds,
) => {
	const [
		servers,
		registries,
		keys,
		providers,
		networks,
		schedulesRows,
		destinationsRows,
		vaults,
		certificatesRows,
	] = await Promise.all([
		database
			.select({ id: server.serverId, organizationId: server.organizationId })
			.from(server)
			.where(inArray(server.serverId, [...dependencies.servers])),
		database
			.select({
				id: registry.registryId,
				organizationId: registry.organizationId,
			})
			.from(registry)
			.where(inArray(registry.registryId, [...dependencies.registries])),
		database
			.select({ id: sshKeys.sshKeyId, organizationId: sshKeys.organizationId })
			.from(sshKeys)
			.where(inArray(sshKeys.sshKeyId, [...dependencies.sshKeys])),
		database
			.select({
				id: gitProvider.gitProviderId,
				organizationId: gitProvider.organizationId,
			})
			.from(gitProvider)
			.where(
				inArray(gitProvider.gitProviderId, [...dependencies.gitProviders]),
			),
		database
			.select({ id: network.networkId, organizationId: network.organizationId })
			.from(network)
			.where(inArray(network.networkId, [...dependencies.networks])),
		database
			.select({
				id: schedules.scheduleId,
				organizationId: schedules.organizationId,
			})
			.from(schedules)
			.where(inArray(schedules.scheduleId, [...dependencies.schedules])),
		database
			.select({
				id: destinations.destinationId,
				organizationId: destinations.organizationId,
			})
			.from(destinations)
			.where(
				inArray(destinations.destinationId, [...dependencies.destinations]),
			),
		database
			.select({
				id: vaultProvider.vaultProviderId,
				organizationId: vaultProvider.organizationId,
			})
			.from(vaultProvider)
			.where(
				inArray(vaultProvider.vaultProviderId, [
					...dependencies.vaultProviders,
				]),
			),
		database
			.select({
				id: certificates.certificateId,
				organizationId: certificates.organizationId,
			})
			.from(certificates)
			.where(
				inArray(certificates.certificateId, [...dependencies.certificates]),
			),
	]);
	return {
		servers,
		registries,
		keys,
		providers,
		networks,
		schedules: schedulesRows,
		destinations: destinationsRows,
		vaults,
		certificates: certificatesRows,
	};
};

const ownershipBlockers = (
	dependencies: DependencyIds,
	owners: Awaited<ReturnType<typeof resourceOwners>>,
	shared: Map<ProjectTransferResourceKind, Set<string>>,
	sourceOrganizationId: string,
	targetOrganizationId: string,
): ProjectTransferBlocker[] => {
	const blockers: ProjectTransferBlocker[] = [];
	const ownerMap: Record<ProjectTransferResourceKind, Map<string, string>> = {
		servers: new Map(owners.servers.map((row) => [row.id, row.organizationId])),
		registries: new Map(
			owners.registries.map((row) => [row.id, row.organizationId]),
		),
		sshKeys: new Map(owners.keys.map((row) => [row.id, row.organizationId])),
		gitProviders: new Map(
			owners.providers.map((row) => [row.id, row.organizationId]),
		),
		networks: new Map(
			owners.networks.map((row) => [row.id, row.organizationId]),
		),
		schedules: new Map(
			owners.schedules.map((row) => [row.id, row.organizationId ?? ""]),
		),
		destinations: new Map(
			owners.destinations.map((row) => [row.id, row.organizationId]),
		),
		vaultProviders: new Map(
			owners.vaults.map((row) => [row.id, row.organizationId]),
		),
		certificates: new Map(
			owners.certificates.map((row) => [row.id, row.organizationId]),
		),
	};

	for (const kind of resourceKinds) {
		const ids = [...dependencies[kind]];
		const found = ownerMap[kind];
		const missing = ids.filter((id) => !found.has(id));
		if (missing.length > 0) {
			blockers.push({
				code: "RESOURCE_NOT_FOUND",
				message: `Some ${kind} referenced by the project no longer exist.`,
				resourceKind: kind,
				resourceIds: missing,
			});
		}
		const foreign = ids.filter((id) => {
			const owner = found.get(id);
			return (
				owner !== undefined &&
				owner !== sourceOrganizationId &&
				owner !== targetOrganizationId
			);
		});
		if (foreign.length > 0) {
			blockers.push({
				code: "RESOURCE_OWNERSHIP_CONFLICT",
				message: `Some ${kind} belong to a different organization and cannot be transferred.`,
				resourceKind: kind,
				resourceIds: foreign,
			});
		}
		const sharedIds = [...(shared.get(kind) ?? [])];
		if (sharedIds.length > 0) {
			blockers.push({
				code: "SHARED_RESOURCE",
				message: `Some ${kind} are shared with other projects and cannot be transferred automatically.`,
				resourceKind: kind,
				resourceIds: sharedIds,
			});
		}
	}

	return blockers;
};

const getProjectPlanData = async (
	database: DatabaseLike,
	projectId: string,
	sourceOrganizationId: string,
	targetOrganizationId: string,
) => {
	const state = await loadProjectState(
		database,
		projectId,
		sourceOrganizationId,
	);
	if (!state) return null;
	const shared = await sharedLinkedResources(database, projectId, state);
	const owners = await resourceOwners(database, state.dependencyIds);
	return {
		state,
		blockers: ownershipBlockers(
			state.dependencyIds,
			owners,
			shared,
			sourceOrganizationId,
			targetOrganizationId,
		),
	};
};

export const getProjectTransferBlockers = ({
	sourceRole,
	targetRole,
	sourceOrganizationId,
	targetOrganizationId,
	projectFound,
	targetFound,
	resourceBlockers = [],
}: {
	sourceRole?: string;
	targetRole?: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	projectFound: boolean;
	targetFound: boolean;
	resourceBlockers?: ProjectTransferBlocker[];
}): ProjectTransferBlocker[] => {
	const blockers = [...resourceBlockers];
	if (!projectFound) {
		blockers.push({
			code: "PROJECT_NOT_FOUND",
			message: "The project was not found in the active organization.",
		});
	}
	if (!targetFound) {
		blockers.push({
			code: "TARGET_NOT_FOUND",
			message: "The destination organization does not exist.",
		});
	}
	if (sourceOrganizationId === targetOrganizationId) {
		blockers.push({
			code: "SAME_ORGANIZATION",
			message: "The project is already in the selected organization.",
		});
	}
	if (!privilegedOrganizationRoles.has(sourceRole ?? "")) {
		blockers.push({
			code: "SOURCE_ACCESS_REQUIRED",
			message:
				"Only source organization owners and admins can transfer projects.",
		});
	}
	if (!privilegedOrganizationRoles.has(targetRole ?? "")) {
		blockers.push({
			code: "TARGET_ACCESS_REQUIRED",
			message: "You must be an owner or admin of the destination organization.",
		});
	}
	return blockers;
};

export const getProjectTransferPlan = async ({
	projectId,
	sourceOrganizationId,
	targetOrganizationId,
	userId,
}: {
	projectId: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	userId: string;
}): Promise<ProjectTransferPlan> => {
	const [targetOrganization, sourceMember, targetMember] = await Promise.all([
		db.query.organization.findFirst({
			where: eq(organization.id, targetOrganizationId),
			columns: { id: true },
		}),
		db.query.member.findFirst({
			where: and(
				eq(member.organizationId, sourceOrganizationId),
				eq(member.userId, userId),
			),
			columns: { role: true },
		}),
		db.query.member.findFirst({
			where: and(
				eq(member.organizationId, targetOrganizationId),
				eq(member.userId, userId),
			),
			columns: { role: true },
		}),
	]);

	const isSourcePrivileged = privilegedOrganizationRoles.has(
		sourceMember?.role ?? "",
	);
	const data = isSourcePrivileged
		? await getProjectPlanData(
				db,
				projectId,
				sourceOrganizationId,
				targetOrganizationId,
			)
		: null;
	const blockers = getProjectTransferBlockers({
		sourceRole: sourceMember?.role,
		targetRole: targetMember?.role,
		sourceOrganizationId,
		targetOrganizationId,
		projectFound: !!data,
		targetFound: !!targetOrganization,
		resourceBlockers: data?.blockers,
	});
	const state = data?.state;
	const dependencies = state ? dependencyEntries(state.dependencyIds) : [];

	return {
		projectId,
		projectName: state?.projectName ?? "",
		sourceOrganizationId,
		targetOrganizationId,
		environmentCount: state?.environmentIds.length ?? 0,
		tagNames: state?.tagNames ?? [],
		serviceCount:
			state?.serviceReferences.filter(
				(reference) => reference.projectId === projectId,
			).length ?? 0,
		dependencies,
		blockers,
		warnings: [
			"Project environment variables, environments, and exclusively referenced infrastructure move with the project.",
			"Shared infrastructure is never moved automatically and must be separated first.",
		],
		canTransfer: blockers.length === 0,
	};
};

const transferResourceOwnership = async (
	tx: DatabaseLike,
	state: ProjectTransferState,
	sourceOrganizationId: string,
	targetOrganizationId: string,
) => {
	const ids = state.dependencyIds;
	if (ids.servers.size > 0) {
		await tx
			.update(server)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(server.organizationId, sourceOrganizationId),
					inArray(server.serverId, [...ids.servers]),
				),
			);
	}
	if (ids.registries.size > 0) {
		await tx
			.update(registry)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(registry.organizationId, sourceOrganizationId),
					inArray(registry.registryId, [...ids.registries]),
				),
			);
	}
	if (ids.sshKeys.size > 0) {
		await tx
			.update(sshKeys)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(sshKeys.organizationId, sourceOrganizationId),
					inArray(sshKeys.sshKeyId, [...ids.sshKeys]),
				),
			);
	}
	if (ids.gitProviders.size > 0) {
		await tx
			.update(gitProvider)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(gitProvider.organizationId, sourceOrganizationId),
					inArray(gitProvider.gitProviderId, [...ids.gitProviders]),
				),
			);
	}
	if (ids.networks.size > 0) {
		await tx
			.update(network)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(network.organizationId, sourceOrganizationId),
					inArray(network.networkId, [...ids.networks]),
				),
			);
	}
	if (ids.destinations.size > 0) {
		await tx
			.update(destinations)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(destinations.organizationId, sourceOrganizationId),
					inArray(destinations.destinationId, [...ids.destinations]),
				),
			);
	}
	if (ids.vaultProviders.size > 0) {
		await tx
			.update(vaultProvider)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(vaultProvider.organizationId, sourceOrganizationId),
					inArray(vaultProvider.vaultProviderId, [...ids.vaultProviders]),
				),
			);
	}
	if (ids.certificates.size > 0) {
		await tx
			.update(certificates)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(certificates.organizationId, sourceOrganizationId),
					inArray(certificates.certificateId, [...ids.certificates]),
				),
			);
	}
};

const transferProjectTags = async (
	tx: DatabaseLike,
	projectId: string,
	targetOrganizationId: string,
) => {
	const sourceTags = await tx
		.select({ name: tags.name, color: tags.color })
		.from(projectTags)
		.innerJoin(tags, eq(projectTags.tagId, tags.tagId))
		.where(eq(projectTags.projectId, projectId));
	await tx.delete(projectTags).where(eq(projectTags.projectId, projectId));
	for (const sourceTag of sourceTags) {
		await tx
			.insert(tags)
			.values({
				tagId: nanoid(),
				name: sourceTag.name,
				color: sourceTag.color,
				organizationId: targetOrganizationId,
			})
			.onConflictDoNothing({ target: [tags.organizationId, tags.name] });
		const targetTag = await tx
			.select({ tagId: tags.tagId })
			.from(tags)
			.where(
				and(
					eq(tags.organizationId, targetOrganizationId),
					eq(tags.name, sourceTag.name),
				),
			)
			.limit(1);
		if (targetTag[0]) {
			await tx
				.insert(projectTags)
				.values({ projectId, tagId: targetTag[0].tagId })
				.onConflictDoNothing();
		}
	}
};

const cleanupSourceAccess = async (
	tx: DatabaseLike,
	state: ProjectTransferState,
	projectId: string,
	sourceOrganizationId: string,
) => {
	const environmentIds = await tx
		.select({ environmentId: environments.environmentId })
		.from(environments)
		.where(eq(environments.projectId, projectId));
	const serviceIds = state.serviceReferences
		.filter((reference) => reference.projectId === projectId)
		.map((reference) => reference.serviceId);
	let accessedServices = sql`${member.accessedServices}`;
	for (const serviceId of serviceIds) {
		accessedServices = sql`array_remove(${accessedServices}, ${serviceId})`;
	}
	let accessedEnvironments = sql`${member.accessedEnvironments}`;
	for (const environment of environmentIds) {
		accessedEnvironments = sql`array_remove(${accessedEnvironments}, ${environment.environmentId})`;
	}
	await tx
		.update(member)
		.set({
			accessedProjects: sql`array_remove(${member.accessedProjects}, ${projectId})`,
			accessedEnvironments,
			accessedServices,
		})
		.where(eq(member.organizationId, sourceOrganizationId));
};

export const transferProject = async ({
	projectId,
	sourceOrganizationId,
	targetOrganizationId,
	userId,
}: {
	projectId: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	userId: string;
}) => {
	const plan = await getProjectTransferPlan({
		projectId,
		sourceOrganizationId,
		targetOrganizationId,
		userId,
	});
	if (!plan.canTransfer) {
		throw new ProjectTransferError(
			plan.blockers[0]?.code === "PROJECT_NOT_FOUND"
				? "PROJECT_NOT_FOUND"
				: "TRANSFER_BLOCKED",
			plan.blockers.map((blocker) => blocker.message).join(" "),
		);
	}

	return await db.transaction(async (tx) => {
		const lockedProject = await tx
			.select({ projectId: projects.projectId, name: projects.name })
			.from(projects)
			.where(
				and(
					eq(projects.projectId, projectId),
					eq(projects.organizationId, sourceOrganizationId),
				),
			)
			.for("update");
		if (!lockedProject[0]) {
			throw new ProjectTransferError(
				"PROJECT_NOT_FOUND",
				"The project changed before the transfer could be completed.",
			);
		}

		const freshData = await getProjectPlanData(
			tx,
			projectId,
			sourceOrganizationId,
			targetOrganizationId,
		);
		if (!freshData || freshData.blockers.length > 0) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"Project dependencies changed while the transfer was being prepared.",
			);
		}
		const [targetOrganization, sourceMember, targetMember] = await Promise.all([
			tx
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.id, targetOrganizationId))
				.limit(1),
			tx
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, sourceOrganizationId),
						eq(member.userId, userId),
					),
				)
				.limit(1),
			tx
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, targetOrganizationId),
						eq(member.userId, userId),
					),
				)
				.limit(1),
		]);
		if (
			!targetOrganization[0] ||
			!privilegedOrganizationRoles.has(sourceMember[0]?.role ?? "") ||
			!privilegedOrganizationRoles.has(targetMember[0]?.role ?? "")
		) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"Organization ownership or transfer permissions changed while the transfer was being prepared.",
			);
		}

		await transferResourceOwnership(
			tx,
			freshData.state,
			sourceOrganizationId,
			targetOrganizationId,
		);
		await transferProjectTags(tx, projectId, targetOrganizationId);
		if (freshData.state.dependencyIds.schedules.size > 0) {
			await tx
				.update(schedules)
				.set({ organizationId: targetOrganizationId })
				.where(
					and(
						eq(schedules.organizationId, sourceOrganizationId),
						inArray(schedules.scheduleId, [
							...freshData.state.dependencyIds.schedules,
						]),
					),
				);
		}
		await tx
			.update(projects)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(projects.projectId, projectId),
					eq(projects.organizationId, sourceOrganizationId),
				),
			);
		await cleanupSourceAccess(
			tx,
			freshData.state,
			projectId,
			sourceOrganizationId,
		);

		return {
			projectId,
			projectName: lockedProject[0].name,
			sourceOrganizationId,
			targetOrganizationId,
		};
	});
};
