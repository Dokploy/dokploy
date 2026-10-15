import {
	applications,
	compose,
	gitProvider,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
} from "@dokploy/server/db/schema";
import { generateRandomHash } from "@dokploy/server/utils/docker/compose";
import { eq } from "drizzle-orm";
import { replaceAppNames } from "../appname";
import type { TransferTx } from "../queries";
import { restoreSecretFields } from "../secret-fields";
import { buildUsedBy, SERVICE_ID_FIELD } from "../service-kinds";
import type {
	ConflictResolution,
	Plan,
	ServiceType,
	Snapshot,
	Warning,
} from "../types";
import {
	insertBackups,
	insertDomains,
	insertMounts,
	insertPorts,
	insertRedirects,
	insertSchedules,
	insertSecurity,
	insertVolumeBackups,
} from "./children";
import type { SharedIdMaps } from "./shared";

const rewriteVaultNames = (
	env: string,
	vaultNameMap: Record<string, string>,
): string => {
	let result = env;
	for (const [oldName, newName] of Object.entries(vaultNameMap)) {
		if (oldName === newName) continue;
		result = result
			.split(`\${{vault.${oldName}.`)
			.join(`\${{vault.${newName}.`);
	}
	return result;
};

const CHILD_ARRAY_KEYS = [
	"domains",
	"mounts",
	"ports",
	"redirects",
	"security",
	"schedules",
	"volumeBackups",
	"backups",
];

const remapCommonFields = (
	ctx: ApplyServicesContext,
	row: Record<string, unknown>,
	oldId: string,
	kind: ServiceType,
	newEnvironmentId: string,
): { row: Record<string, unknown>; networkIdsSkipped: number } => {
	const { plan, idMaps, secretsPlain, vaultNameMap, serviceServerMap } = ctx;
	const oldAppName = row.appName as string | undefined;
	const oldServerId = serviceServerMap.get(oldId) ?? null;
	const restored = restoreSecretFields(kind, row, secretsPlain);
	delete restored.kind;
	for (const key of CHILD_ARRAY_KEYS) {
		delete restored[key];
	}
	if (typeof restored.env === "string") {
		restored.env = rewriteVaultNames(
			replaceAppNames(restored.env, plan.appNameMap),
			vaultNameMap,
		);
	}
	const oldNetworkIds = (row.networkIds as string[] | null) ?? [];
	const networkIds = oldNetworkIds
		.map((id) => idMaps.network[id])
		.filter((id): id is string => Boolean(id));

	return {
		row: {
			...restored,
			environmentId: newEnvironmentId,
			serverId: plan.serverMap[oldServerId ?? "null"] ?? null,
			appName: oldAppName
				? (plan.appNameMap[oldAppName] ?? oldAppName)
				: oldAppName,
			networkIds,
		},
		networkIdsSkipped: oldNetworkIds.length - networkIds.length,
	};
};

const skipWarning = (
	skipped: number,
	code: Warning["code"],
	message: (name: string) => string,
	serviceType: ServiceType,
	serviceId: string,
	row: Record<string, unknown>,
	environmentId: string,
): Warning[] => {
	if (skipped === 0) return [];
	const usedBy = buildUsedBy(environmentId, serviceType, row, serviceId);
	return [
		{
			code,
			severity: "warning",
			message: message(usedBy.serviceName),
			affected: [usedBy],
		},
	];
};

const buildBackupSkipWarning = (
	skipped: number,
	serviceType: ServiceType,
	serviceId: string,
	row: Record<string, unknown>,
	environmentId: string,
): Warning[] =>
	skipWarning(
		skipped,
		"BACKUP_DESTINATION_UNRESOLVED",
		(name) =>
			`${skipped} backup/volume backup entr${skipped === 1 ? "y" : "ies"} for "${name}" were dropped; their destination was never resolved.`,
		serviceType,
		serviceId,
		row,
		environmentId,
	);

const buildNetworkSkipWarning = (
	skipped: number,
	serviceType: ServiceType,
	serviceId: string,
	row: Record<string, unknown>,
	environmentId: string,
): Warning[] =>
	skipWarning(
		skipped,
		"NETWORK_UNRESOLVED",
		(name) =>
			`${skipped} network attachment${skipped === 1 ? "" : "s"} for "${name}" ${skipped === 1 ? "was" : "were"} dropped; its network was never resolved.`,
		serviceType,
		serviceId,
		row,
		environmentId,
	);

const GIT_PROVIDER_SUB_TABLE: Record<
	"github" | "gitlab" | "gitea" | "bitbucket",
	{ query: "github" | "gitlab" | "gitea" | "bitbucket"; idField: string }
> = {
	github: { query: "github", idField: "githubId" },
	gitlab: { query: "gitlab", idField: "gitlabId" },
	gitea: { query: "gitea", idField: "giteaId" },
	bitbucket: { query: "bitbucket", idField: "bitbucketId" },
};

const resolveGitProviderFks = async (
	tx: TransferTx,
	snapshot: Snapshot,
	plan: Plan,
	serviceId: string,
	organizationId: string,
): Promise<Record<string, string>> => {
	const fks: Record<string, string> = {};
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "gitProvider") continue;
		if (!requirement.usedBy.some((u) => u.serviceId === serviceId)) continue;
		const resolution =
			plan.resolutions[`gitProvider:${requirement.originalId ?? "null"}`];
		if (resolution?.action !== "reuse" || !resolution.targetId) continue;
		const gitProviderRow = await tx.query.gitProvider.findFirst({
			where: eq(gitProvider.gitProviderId, resolution.targetId),
			columns: { organizationId: true },
		});
		if (!gitProviderRow || gitProviderRow.organizationId !== organizationId) {
			throw new Error(
				`Cannot reuse gitProvider "${resolution.targetId}": not found in this organization`,
			);
		}
		const table = GIT_PROVIDER_SUB_TABLE[requirement.providerType];
		const row = await (
			tx.query[table.query] as {
				findFirst: (
					args: unknown,
				) => Promise<Record<string, unknown> | undefined>;
			}
		).findFirst({
			where: (
				fields: Record<string, unknown>,
				{ eq }: { eq: (a: unknown, b: unknown) => unknown },
			) => eq(fields.gitProviderId, resolution.targetId),
		});
		if (row) {
			fks[table.idField] = row[table.idField] as string;
		}
	}
	return fks;
};

export type ApplyServicesContext = {
	tx: TransferTx;
	snapshot: Snapshot;
	plan: Plan;
	idMaps: SharedIdMaps;
	secretsPlain: Map<string, string>;
	vaultNameMap: Record<string, string>;
	conflictResolutions: Record<string, ConflictResolution>;
	organizationId: string;
	serverIpMap: Record<string, string>;
	serviceServerMap: Map<string, string | null>;
	serviceBuildServerMap: Map<string, string | null>;
};

export const insertApplication = async (
	ctx: ApplyServicesContext,
	row: Record<string, unknown>,
	newEnvironmentId: string,
): Promise<{ oldId: string; newId: string; warnings: Warning[] }> => {
	const { tx, plan, idMaps, secretsPlain, vaultNameMap, snapshot } = ctx;
	const oldId = row.applicationId as string;
	const { row: common, networkIdsSkipped } = remapCommonFields(
		ctx,
		row,
		oldId,
		"application",
		newEnvironmentId,
	);
	const gitProviderFks = await resolveGitProviderFks(
		tx,
		snapshot,
		plan,
		oldId,
		ctx.organizationId,
	);
	const oldBuildServerId = ctx.serviceBuildServerMap.get(oldId) ?? null;
	const buildServerId = oldBuildServerId
		? (plan.serverMap[oldBuildServerId] ?? null)
		: null;

	const [inserted] = await tx
		.insert(applications)
		.values({
			...common,
			applicationId: undefined,
			registryId: common.registryId
				? (idMaps.registry[common.registryId as string] ?? null)
				: null,
			buildRegistryId: common.buildRegistryId
				? (idMaps.registry[common.buildRegistryId as string] ?? null)
				: null,
			rollbackRegistryId: common.rollbackRegistryId
				? (idMaps.registry[common.rollbackRegistryId as string] ?? null)
				: null,
			customGitSSHKeyId: common.customGitSSHKeyId
				? (idMaps.sshKey[common.customGitSSHKeyId as string] ?? null)
				: null,
			buildServerId,
			...gitProviderFks,
		} as unknown as typeof applications.$inferInsert)
		.returning();

	if (!inserted) {
		throw new Error(`Failed to insert application ${oldId}`);
	}
	const newId = inserted.applicationId;
	const parent = { applicationId: newId };

	await insertDomains(
		tx,
		(row.domains as Record<string, unknown>[]) ?? [],
		parent,
		plan.appNameMap,
		plan.domainStrategy,
		ctx.conflictResolutions,
		ctx.serverIpMap[(common.serverId as string | null) ?? "local"] ?? null,
	);
	await insertMounts(
		tx,
		(row.mounts as Record<string, unknown>[]) ?? [],
		parent,
		plan.appNameMap,
		secretsPlain,
	);
	await insertPorts(
		tx,
		(row.ports as Record<string, unknown>[]) ?? [],
		newId,
		plan.portsStrategy,
		ctx.conflictResolutions,
	);
	await insertRedirects(
		tx,
		(row.redirects as Record<string, unknown>[]) ?? [],
		newId,
	);
	await insertSecurity(
		tx,
		(row.security as Record<string, unknown>[]) ?? [],
		newId,
		secretsPlain,
	);
	await insertSchedules(
		tx,
		(row.schedules as Record<string, unknown>[]) ?? [],
		parent,
		ctx.organizationId,
		(common.serverId as string | null) ?? null,
	);
	const { skipped: volumeBackupsSkipped } = await insertVolumeBackups(
		tx,
		(row.volumeBackups as Record<string, unknown>[]) ?? [],
		parent,
		ctx.idMaps.destination,
		plan.appNameMap,
	);

	return {
		oldId,
		newId,
		warnings: [
			...buildBackupSkipWarning(
				volumeBackupsSkipped,
				"application",
				newId,
				row,
				newEnvironmentId,
			),
			...buildNetworkSkipWarning(
				networkIdsSkipped,
				"application",
				newId,
				row,
				newEnvironmentId,
			),
		],
	};
};

export const insertCompose = async (
	ctx: ApplyServicesContext,
	row: Record<string, unknown>,
	newEnvironmentId: string,
): Promise<{ oldId: string; newId: string; warnings: Warning[] }> => {
	const { tx, plan, idMaps, secretsPlain, vaultNameMap, snapshot } = ctx;
	const oldId = row.composeId as string;
	const { row: common } = remapCommonFields(
		ctx,
		row,
		oldId,
		"compose",
		newEnvironmentId,
	);
	const gitProviderFks = await resolveGitProviderFks(
		tx,
		snapshot,
		plan,
		oldId,
		ctx.organizationId,
	);

	const [inserted] = await tx
		.insert(compose)
		.values({
			...common,
			composeId: undefined,
			customGitSSHKeyId: common.customGitSSHKeyId
				? (idMaps.sshKey[common.customGitSSHKeyId as string] ?? null)
				: null,
			suffix: common.suffix ? generateRandomHash() : common.suffix,
			...gitProviderFks,
		} as unknown as typeof compose.$inferInsert)
		.returning();

	if (!inserted) {
		throw new Error(`Failed to insert compose ${oldId}`);
	}
	const newId = inserted.composeId;
	const parent = { composeId: newId };

	await insertDomains(
		tx,
		(row.domains as Record<string, unknown>[]) ?? [],
		parent,
		plan.appNameMap,
		plan.domainStrategy,
		ctx.conflictResolutions,
		ctx.serverIpMap[(common.serverId as string | null) ?? "local"] ?? null,
	);
	await insertMounts(
		tx,
		(row.mounts as Record<string, unknown>[]) ?? [],
		parent,
		plan.appNameMap,
		secretsPlain,
	);
	const { skipped: backupsSkipped } = await insertBackups(
		tx,
		(row.backups as Record<string, unknown>[]) ?? [],
		parent,
		ctx.idMaps.destination,
		secretsPlain,
	);
	await insertSchedules(
		tx,
		(row.schedules as Record<string, unknown>[]) ?? [],
		parent,
		ctx.organizationId,
		(common.serverId as string | null) ?? null,
	);
	const { skipped: volumeBackupsSkipped } = await insertVolumeBackups(
		tx,
		(row.volumeBackups as Record<string, unknown>[]) ?? [],
		parent,
		ctx.idMaps.destination,
		plan.appNameMap,
	);

	return {
		oldId,
		newId,
		warnings: buildBackupSkipWarning(
			backupsSkipped + volumeBackupsSkipped,
			"compose",
			newId,
			row,
			newEnvironmentId,
		),
	};
};

const DB_TABLES = {
	postgres: { table: postgres, hasBackups: true },
	mysql: { table: mysql, hasBackups: true },
	mariadb: { table: mariadb, hasBackups: true },
	mongo: { table: mongo, hasBackups: true },
	redis: { table: redis, hasBackups: false },
	libsql: { table: libsql, hasBackups: true },
} as const;

export type DbServiceKind = keyof typeof DB_TABLES;
export const DB_SERVICE_KINDS = Object.keys(DB_TABLES) as DbServiceKind[];

export const insertDbService = async (
	ctx: ApplyServicesContext,
	kind: DbServiceKind,
	row: Record<string, unknown>,
	newEnvironmentId: string,
): Promise<{ oldId: string; newId: string; warnings: Warning[] }> => {
	const { tx, plan, idMaps, secretsPlain, vaultNameMap } = ctx;
	const idField = SERVICE_ID_FIELD[kind];
	const oldId = row[idField] as string;
	const { row: common, networkIdsSkipped } = remapCommonFields(
		ctx,
		row,
		oldId,
		kind,
		newEnvironmentId,
	);
	const { table, hasBackups } = DB_TABLES[kind];

	const [inserted] = await tx
		.insert(table)
		.values({ ...common, [idField]: undefined } as never)
		.returning();
	if (!inserted) {
		throw new Error(`Failed to insert ${kind} ${oldId}`);
	}
	const newId = (inserted as Record<string, unknown>)[idField] as string;
	const parent = { [idField]: newId };

	await insertMounts(
		tx,
		(row.mounts as Record<string, unknown>[]) ?? [],
		parent,
		plan.appNameMap,
		secretsPlain,
	);
	const { skipped: volumeBackupsSkipped } = await insertVolumeBackups(
		tx,
		(row.volumeBackups as Record<string, unknown>[]) ?? [],
		parent,
		ctx.idMaps.destination,
		plan.appNameMap,
	);
	let backupsSkipped = 0;
	if (hasBackups) {
		({ skipped: backupsSkipped } = await insertBackups(
			tx,
			(row.backups as Record<string, unknown>[]) ?? [],
			parent,
			ctx.idMaps.destination,
			secretsPlain,
		));
	}

	return {
		oldId,
		newId,
		warnings: [
			...buildBackupSkipWarning(
				volumeBackupsSkipped + backupsSkipped,
				kind,
				newId,
				row,
				newEnvironmentId,
			),
			...buildNetworkSkipWarning(
				networkIdsSkipped,
				kind,
				newId,
				row,
				newEnvironmentId,
			),
		],
	};
};
