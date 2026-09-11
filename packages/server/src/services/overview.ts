import { db } from "@dokploy/server/db";
import {
	applications,
	backups,
	compose,
	deployments,
	destinations,
	domains,
	environments,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	previewDeployments,
	projects,
	redis,
	server as serverTable,
	volumeBackups,
} from "@dokploy/server/db/schema";
import { and, desc, eq, inArray, isNull, max, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type {
	OverviewBackup,
	OverviewDomain,
	OverviewDomainOwnerType,
	OverviewService,
	OverviewServiceType,
} from "./overview-shared";

// Re-exported for existing "./overview" consumers; client components should import overview-shared directly.
export * from "./overview-shared";

type TypeQueryConfig = {
	type: OverviewServiceType;
	table:
		| typeof applications
		| typeof postgres
		| typeof mysql
		| typeof mariadb
		| typeof mongo
		| typeof redis
		| typeof compose
		| typeof libsql;
	idColumn: { name: string };
	statusColumn: { name: string };
	hasIcon: boolean;
};

async function getServicesOfType(
	config: TypeQueryConfig,
	orgId: string,
	accessedServices: string[] | null,
): Promise<OverviewService[]> {
	const table = config.table as typeof applications;
	const idCol = (table as unknown as Record<string, unknown>)[
		config.idColumn.name
	] as typeof applications.applicationId;
	const statusCol = (table as unknown as Record<string, unknown>)[
		config.statusColumn.name
	] as typeof applications.applicationStatus;
	const iconCol = config.hasIcon
		? ((table as unknown as Record<string, unknown>)
				.icon as typeof applications.icon)
		: null;

	const conditions = [
		eq(projects.organizationId, orgId),
		...(accessedServices !== null ? [inArray(idCol, accessedServices)] : []),
	];

	const baseSelect = {
		id: idCol,
		name: table.name,
		appName: table.appName,
		status: statusCol,
		createdAt: table.createdAt,
		serverId: table.serverId,
		serverName: serverTable.name,
		projectId: projects.projectId,
		projectName: projects.name,
		environmentId: environments.environmentId,
		environmentName: environments.name,
	};

	// Only select icon when the table has that column — other service tables don't.
	const rows = await db
		.select(iconCol ? { ...baseSelect, icon: iconCol } : baseSelect)
		.from(table)
		.innerJoin(
			environments,
			eq(table.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.leftJoin(serverTable, eq(table.serverId, serverTable.serverId))
		.where(and(...conditions));

	return rows.map((row) => ({
		...row,
		icon: "icon" in row ? (row.icon as string | null) : null,
		type: config.type,
		lastDeployAt: null,
	}));
}

const SERVICE_TYPE_CONFIGS: TypeQueryConfig[] = [
	{
		type: "application",
		table: applications,
		idColumn: { name: "applicationId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: true,
	},
	{
		type: "postgres",
		table: postgres,
		idColumn: { name: "postgresId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: false,
	},
	{
		type: "mysql",
		table: mysql,
		idColumn: { name: "mysqlId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: false,
	},
	{
		type: "mariadb",
		table: mariadb,
		idColumn: { name: "mariadbId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: false,
	},
	{
		type: "mongo",
		table: mongo,
		idColumn: { name: "mongoId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: false,
	},
	{
		type: "redis",
		table: redis,
		idColumn: { name: "redisId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: false,
	},
	{
		type: "compose",
		table: compose,
		idColumn: { name: "composeId" },
		statusColumn: { name: "composeStatus" },
		hasIcon: true,
	},
	{
		type: "libsql",
		table: libsql,
		idColumn: { name: "libsqlId" },
		statusColumn: { name: "applicationStatus" },
		hasIcon: false,
	},
];

// Only application/compose have a deployments FK, so lastDeployAt only applies to those.
async function attachLastDeployAt(
	services: OverviewService[],
): Promise<OverviewService[]> {
	const applicationIds = services
		.filter((s) => s.type === "application")
		.map((s) => s.id);
	const composeIds = services
		.filter((s) => s.type === "compose")
		.map((s) => s.id);

	const [appDeploys, composeDeploys] = await Promise.all([
		applicationIds.length > 0
			? db
					.select({
						applicationId: deployments.applicationId,
						lastDeployAt: max(deployments.createdAt),
					})
					.from(deployments)
					.where(inArray(deployments.applicationId, applicationIds))
					.groupBy(deployments.applicationId)
			: Promise.resolve([]),
		composeIds.length > 0
			? db
					.select({
						composeId: deployments.composeId,
						lastDeployAt: max(deployments.createdAt),
					})
					.from(deployments)
					.where(inArray(deployments.composeId, composeIds))
					.groupBy(deployments.composeId)
			: Promise.resolve([]),
	]);

	const lastAppDeploy = new Map<string, string>();
	for (const row of appDeploys) {
		if (row.applicationId && row.lastDeployAt) {
			lastAppDeploy.set(row.applicationId, row.lastDeployAt);
		}
	}
	const lastComposeDeploy = new Map<string, string>();
	for (const row of composeDeploys) {
		if (row.composeId && row.lastDeployAt) {
			lastComposeDeploy.set(row.composeId, row.lastDeployAt);
		}
	}

	return services.map((service) => {
		if (service.type === "application") {
			return {
				...service,
				lastDeployAt: lastAppDeploy.get(service.id) ?? null,
			};
		}
		if (service.type === "compose") {
			return {
				...service,
				lastDeployAt: lastComposeDeploy.get(service.id) ?? null,
			};
		}
		return service;
	});
}

export const getAllServicesForOrganization = async (
	orgId: string,
	accessedServices: string[] | null,
): Promise<OverviewService[]> => {
	if (accessedServices !== null && accessedServices.length === 0) {
		return [];
	}

	const results = await Promise.all(
		SERVICE_TYPE_CONFIGS.map((config) =>
			getServicesOfType(config, orgId, accessedServices),
		),
	);

	return attachLastDeployAt(results.flat());
};

type Owner = {
	id: string;
	name: string;
	serverId: string | null;
	type: OverviewServiceType;
	projectId: string | null;
	environmentId: string | null;
};

type OwnerRow = {
	name: string;
	serverId: string | null;
	environment?: {
		environmentId: string;
		project?: { projectId: string } | null;
	} | null;
};

function ownerFrom(
	row: OwnerRow,
	id: string,
	type: OverviewServiceType,
): Owner {
	return {
		id,
		name: row.name,
		serverId: row.serverId,
		type,
		projectId: row.environment?.project?.projectId ?? null,
		environmentId: row.environment?.environmentId ?? null,
	};
}

// Picks the first non-null relation out of several mutually-exclusive owner candidates.
// Shared by backups, volume backups, and domains — all resolve "which one of these
// nullable relations is actually set" the same way.
function pickFirst<TRow, TType extends string>(
	candidates: Array<
		[row: TRow | null | undefined, id: string | undefined, type: TType]
	>,
): [TRow, string, TType] | null {
	for (const [row, id, type] of candidates) {
		if (row && id) return [row, id, type];
	}
	return null;
}

function pickBackupOwner(backup: {
	postgres?: (OwnerRow & { postgresId: string }) | null;
	mariadb?: (OwnerRow & { mariadbId: string }) | null;
	mysql?: (OwnerRow & { mysqlId: string }) | null;
	mongo?: (OwnerRow & { mongoId: string }) | null;
	libsql?: (OwnerRow & { libsqlId: string }) | null;
	compose?: (OwnerRow & { composeId: string }) | null;
}): Owner | null {
	const found = pickFirst<OwnerRow, OverviewServiceType>([
		[backup.postgres, backup.postgres?.postgresId, "postgres"],
		[backup.mariadb, backup.mariadb?.mariadbId, "mariadb"],
		[backup.mysql, backup.mysql?.mysqlId, "mysql"],
		[backup.mongo, backup.mongo?.mongoId, "mongo"],
		[backup.libsql, backup.libsql?.libsqlId, "libsql"],
		[backup.compose, backup.compose?.composeId, "compose"],
	]);
	return found ? ownerFrom(...found) : null;
}

function pickVolumeBackupOwner(volumeBackup: {
	application?: (OwnerRow & { applicationId: string }) | null;
	postgres?: (OwnerRow & { postgresId: string }) | null;
	mariadb?: (OwnerRow & { mariadbId: string }) | null;
	mysql?: (OwnerRow & { mysqlId: string }) | null;
	mongo?: (OwnerRow & { mongoId: string }) | null;
	redis?: (OwnerRow & { redisId: string }) | null;
	libsql?: (OwnerRow & { libsqlId: string }) | null;
	compose?: (OwnerRow & { composeId: string }) | null;
}): Owner | null {
	const found = pickFirst<OwnerRow, OverviewServiceType>([
		[
			volumeBackup.application,
			volumeBackup.application?.applicationId,
			"application",
		],
		[volumeBackup.postgres, volumeBackup.postgres?.postgresId, "postgres"],
		[volumeBackup.mariadb, volumeBackup.mariadb?.mariadbId, "mariadb"],
		[volumeBackup.mysql, volumeBackup.mysql?.mysqlId, "mysql"],
		[volumeBackup.mongo, volumeBackup.mongo?.mongoId, "mongo"],
		[volumeBackup.redis, volumeBackup.redis?.redisId, "redis"],
		[volumeBackup.libsql, volumeBackup.libsql?.libsqlId, "libsql"],
		[volumeBackup.compose, volumeBackup.compose?.composeId, "compose"],
	]);
	return found ? ownerFrom(...found) : null;
}

// Ownerless backups (e.g. the Dokploy host's own database) are visible to everyone.
function ownerAccessCondition(
	ownerColumns: AnyPgColumn[],
	accessedServices: string[] | null,
) {
	if (accessedServices === null) return undefined;
	return or(
		and(...ownerColumns.map((col) => isNull(col))),
		...ownerColumns.map((col) => inArray(col, accessedServices)),
	);
}

async function getBackupIdsInOrg(
	orgId: string,
	accessedServices: string[] | null,
): Promise<string[]> {
	const accessCondition = ownerAccessCondition(
		[
			backups.postgresId,
			backups.mariadbId,
			backups.mysqlId,
			backups.mongoId,
			backups.libsqlId,
			backups.composeId,
		],
		accessedServices,
	);

	const rows = await db
		.select({ backupId: backups.backupId })
		.from(backups)
		.innerJoin(
			destinations,
			eq(backups.destinationId, destinations.destinationId),
		)
		.where(
			and(
				eq(destinations.organizationId, orgId),
				...(accessCondition ? [accessCondition] : []),
			),
		);
	return rows.map((r) => r.backupId);
}

async function getVolumeBackupIdsInOrg(
	orgId: string,
	accessedServices: string[] | null,
): Promise<string[]> {
	const accessCondition = ownerAccessCondition(
		[
			volumeBackups.applicationId,
			volumeBackups.postgresId,
			volumeBackups.mariadbId,
			volumeBackups.mysqlId,
			volumeBackups.mongoId,
			volumeBackups.redisId,
			volumeBackups.libsqlId,
			volumeBackups.composeId,
		],
		accessedServices,
	);

	const rows = await db
		.select({ volumeBackupId: volumeBackups.volumeBackupId })
		.from(volumeBackups)
		.innerJoin(
			destinations,
			eq(volumeBackups.destinationId, destinations.destinationId),
		)
		.where(
			and(
				eq(destinations.organizationId, orgId),
				...(accessCondition ? [accessCondition] : []),
			),
		);
	return rows.map((r) => r.volumeBackupId);
}

const ownerServiceColumns = {
	columns: { name: true, serverId: true },
	with: {
		environment: {
			columns: { environmentId: true },
			with: { project: { columns: { projectId: true } } },
		},
	},
} as const;

// "Backups" here = run history (deployments with backupId/volumeBackupId), not the schedule configs.
export const getAllBackupsForOrganization = async (
	orgId: string,
	accessedServices: string[] | null,
	permissions: { backup: boolean; volumeBackup: boolean },
): Promise<OverviewBackup[]> => {
	if (accessedServices !== null && accessedServices.length === 0) {
		return [];
	}

	const [backupIds, volumeBackupIds] = await Promise.all([
		permissions.backup
			? getBackupIdsInOrg(orgId, accessedServices)
			: Promise.resolve([]),
		permissions.volumeBackup
			? getVolumeBackupIdsInOrg(orgId, accessedServices)
			: Promise.resolve([]),
	]);

	if (backupIds.length === 0 && volumeBackupIds.length === 0) {
		return [];
	}

	const conditions = [
		...(backupIds.length > 0 ? [inArray(deployments.backupId, backupIds)] : []),
		...(volumeBackupIds.length > 0
			? [inArray(deployments.volumeBackupId, volumeBackupIds)]
			: []),
	];
	const whereClause =
		conditions.length === 1 ? conditions[0] : or(...conditions);

	const rows = await db.query.deployments.findMany({
		where: whereClause,
		orderBy: desc(deployments.createdAt),
		limit: 500,
		with: {
			backup: {
				with: {
					destination: { columns: { destinationId: true, name: true } },
					postgres: {
						columns: { postgresId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					mariadb: {
						columns: { mariadbId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					mysql: {
						columns: { mysqlId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					mongo: {
						columns: { mongoId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					libsql: {
						columns: { libsqlId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					compose: {
						columns: { composeId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
				},
			},
			volumeBackup: {
				with: {
					destination: { columns: { destinationId: true, name: true } },
					application: {
						columns: { applicationId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					postgres: {
						columns: { postgresId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					mariadb: {
						columns: { mariadbId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					mysql: {
						columns: { mysqlId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					mongo: {
						columns: { mongoId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					redis: {
						columns: { redisId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					libsql: {
						columns: { libsqlId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
					compose: {
						columns: { composeId: true, ...ownerServiceColumns.columns },
						with: ownerServiceColumns.with,
					},
				},
			},
		},
	});

	const result: OverviewBackup[] = [];
	for (const deployment of rows) {
		if (deployment.backup) {
			const owner = pickBackupOwner(deployment.backup);
			result.push({
				deploymentId: deployment.deploymentId,
				kind: "backup",
				status: deployment.status,
				createdAt: deployment.createdAt,
				destinationId: deployment.backup.destination?.destinationId ?? "",
				destinationName: deployment.backup.destination?.name ?? "Unknown",
				databaseType: deployment.backup.databaseType,
				serviceType: null,
				backupType: deployment.backup.backupType,
				serviceName: owner?.name ?? "Dokploy Server",
				serviceOwnerId: owner?.id ?? null,
				serviceOwnerType: owner?.type ?? "web-server",
				serverId: owner?.serverId ?? null,
				projectId: owner?.projectId ?? null,
				environmentId: owner?.environmentId ?? null,
			});
		} else if (deployment.volumeBackup) {
			const owner = pickVolumeBackupOwner(deployment.volumeBackup);
			result.push({
				deploymentId: deployment.deploymentId,
				kind: "volumeBackup",
				status: deployment.status,
				createdAt: deployment.createdAt,
				destinationId: deployment.volumeBackup.destination?.destinationId ?? "",
				destinationName: deployment.volumeBackup.destination?.name ?? "Unknown",
				databaseType: null,
				serviceType: deployment.volumeBackup.serviceType,
				backupType: null,
				serviceName:
					owner?.name ?? deployment.volumeBackup.serviceName ?? "Unknown",
				serviceOwnerId: owner?.id ?? null,
				serviceOwnerType:
					owner?.type ??
					(deployment.volumeBackup.serviceType as OverviewServiceType),
				serverId: owner?.serverId ?? null,
				projectId: owner?.projectId ?? null,
				environmentId: owner?.environmentId ?? null,
			});
		}
	}
	return result;
};

type DomainOwnerRow = {
	name: string;
	environment?: {
		environmentId: string;
		name: string;
		project?: {
			projectId: string;
			name: string;
			organizationId: string;
		} | null;
	} | null;
};

type DomainOwner = {
	id: string;
	name: string;
	type: OverviewDomainOwnerType;
	organizationId: string | null;
	projectId: string | null;
	projectName: string | null;
	environmentId: string | null;
	environmentName: string | null;
};

const domainOwnerColumns = {
	columns: { name: true },
	with: {
		environment: {
			columns: { environmentId: true, name: true },
			with: {
				project: {
					columns: { projectId: true, name: true, organizationId: true },
				},
			},
		},
	},
} as const;

function domainOwnerFrom(
	row: DomainOwnerRow,
	id: string,
	type: OverviewDomainOwnerType,
): DomainOwner {
	return {
		id,
		name: row.name,
		type,
		organizationId: row.environment?.project?.organizationId ?? null,
		projectId: row.environment?.project?.projectId ?? null,
		projectName: row.environment?.project?.name ?? null,
		environmentId: row.environment?.environmentId ?? null,
		environmentName: row.environment?.name ?? null,
	};
}

// Same scoping rule as ownerAccessCondition, just without the "ownerless rows are public" OR branch.
function orgScopeCondition(
	orgId: string,
	idColumn: AnyPgColumn,
	accessedServices: string[] | null,
) {
	return accessedServices !== null
		? and(
				eq(projects.organizationId, orgId),
				inArray(idColumn, accessedServices),
			)
		: eq(projects.organizationId, orgId);
}

// Preview domains inherit access from their parent application, so they're scoped by the same accessedServices check as applications.
async function getDomainScopeIdsInOrg(
	orgId: string,
	accessedServices: string[] | null,
): Promise<{ appIds: string[]; composeIds: string[]; previewIds: string[] }> {
	const [appRows, composeRows, previewRows] = await Promise.all([
		db
			.select({ id: applications.applicationId })
			.from(applications)
			.innerJoin(
				environments,
				eq(applications.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId))
			.where(
				orgScopeCondition(orgId, applications.applicationId, accessedServices),
			),
		db
			.select({ id: compose.composeId })
			.from(compose)
			.innerJoin(
				environments,
				eq(compose.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId))
			.where(orgScopeCondition(orgId, compose.composeId, accessedServices)),
		db
			.select({ id: previewDeployments.previewDeploymentId })
			.from(previewDeployments)
			.innerJoin(
				applications,
				eq(previewDeployments.applicationId, applications.applicationId),
			)
			.innerJoin(
				environments,
				eq(applications.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId))
			.where(
				orgScopeCondition(orgId, applications.applicationId, accessedServices),
			),
	]);

	return {
		appIds: appRows.map((r) => r.id),
		composeIds: composeRows.map((r) => r.id),
		previewIds: previewRows.map((r) => r.id),
	};
}

export const getAllDomainsForOrganization = async (
	orgId: string,
	accessedServices: string[] | null,
): Promise<OverviewDomain[]> => {
	if (accessedServices !== null && accessedServices.length === 0) {
		return [];
	}

	const { appIds, composeIds, previewIds } = await getDomainScopeIdsInOrg(
		orgId,
		accessedServices,
	);
	if (
		appIds.length === 0 &&
		composeIds.length === 0 &&
		previewIds.length === 0
	) {
		return [];
	}

	const scopeConditions = [
		...(appIds.length > 0 ? [inArray(domains.applicationId, appIds)] : []),
		...(composeIds.length > 0 ? [inArray(domains.composeId, composeIds)] : []),
		...(previewIds.length > 0
			? [inArray(domains.previewDeploymentId, previewIds)]
			: []),
	];

	const rows = await db.query.domains.findMany({
		where: or(...scopeConditions),
		with: {
			application: {
				columns: { applicationId: true, ...domainOwnerColumns.columns },
				with: domainOwnerColumns.with,
			},
			compose: {
				columns: { composeId: true, ...domainOwnerColumns.columns },
				with: domainOwnerColumns.with,
			},
			previewDeployment: {
				columns: {},
				with: {
					application: {
						columns: { applicationId: true, ...domainOwnerColumns.columns },
						with: domainOwnerColumns.with,
					},
				},
			},
		},
	});

	const result: OverviewDomain[] = [];
	for (const domain of rows) {
		const foundOwner = pickFirst<DomainOwnerRow, OverviewDomainOwnerType>([
			[domain.application, domain.application?.applicationId, "application"],
			[domain.compose, domain.compose?.composeId, "compose"],
			[
				domain.previewDeployment?.application,
				domain.previewDeployment?.application?.applicationId,
				"application",
			],
		]);
		const owner = foundOwner ? domainOwnerFrom(...foundOwner) : null;

		if (!owner || owner.organizationId !== orgId) continue;
		if (accessedServices !== null && !accessedServices.includes(owner.id)) {
			continue;
		}

		result.push({
			domainId: domain.domainId,
			host: domain.host,
			path: domain.path,
			port: domain.port,
			customEntrypoint: domain.customEntrypoint,
			https: domain.https,
			certificateType: domain.certificateType,
			createdAt: domain.createdAt,
			enabled: domain.enabled,
			domainType: domain.domainType,
			serviceOwnerId: owner.id,
			serviceOwnerType: owner.type,
			serviceName: owner.name,
			projectId: owner.projectId ?? "",
			projectName: owner.projectName ?? "",
			environmentId: owner.environmentId ?? "",
			environmentName: owner.environmentName ?? "",
		});
	}
	return result;
};
