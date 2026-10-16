import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	generateBackupCommand,
	getComposeContainerCommand,
	getLibsqlBackupCommand,
	getMariadbBackupCommand,
	getMysqlBackupCommand,
	getPostgresBackupCommand,
	getServiceContainerCommand,
} from "@dokploy/server/utils/backups/utils";
import { quote } from "shell-quote";
import type { ProjectTree, TransferDb } from "./queries";
import {
	at,
	fileSize,
	type Location,
	mkdirp,
	remove,
	runToFile,
	safeErrorMessage,
} from "./remote-fs";
import { SERVICE_ID_FIELD, scopedServices } from "./service-kinds";
import type {
	DumpIndex,
	Emit,
	ExportScope,
	ServiceType,
	UsedBy,
	Warning,
} from "./types";
import { MAX_EMBEDDED_DUMP_BYTES } from "./types";

export type { DumpIndex } from "./types";

export const LIBSQL_DATA_DIR = "iku.db";

const getMongoInstanceDumpCommand = (
	databaseUser: string,
	databasePassword: string,
) =>
	`docker exec -e DB_USER=${quote([databaseUser])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID bash -c 'set -o pipefail; mongodump -u "$DB_USER" -p "$DB_PASS" --authenticationDatabase admin --archive --gzip'`;

export const DUMPABLE_DB_TYPES: ServiceType[] = [
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"libsql",
];

type DumpCommand = { command: string; ext: string; containerSearch: string };

export const DUMP_EXT: Record<string, string> = {
	postgres: "sql.gz",
	mysql: "sql.gz",
	mariadb: "sql.gz",
	mongo: "archive.gz",
	libsql: "tar.gz",
};

export const buildDumpCommand = (
	serviceType: ServiceType,
	service: Record<string, unknown>,
): DumpCommand | undefined => {
	const appName = service.appName as string;
	const containerSearch = getServiceContainerCommand(appName);
	switch (serviceType) {
		case "postgres":
			return {
				command: getPostgresBackupCommand(
					service.databaseName as string,
					service.databaseUser as string,
				),
				ext: DUMP_EXT[serviceType] as string,
				containerSearch,
			};
		case "mysql":
			return {
				command: getMysqlBackupCommand(
					service.databaseName as string,
					service.databaseRootPassword as string,
				),
				ext: DUMP_EXT[serviceType] as string,
				containerSearch,
			};
		case "mariadb":
			return {
				command: getMariadbBackupCommand(
					service.databaseName as string,
					service.databaseUser as string,
					service.databasePassword as string,
				),
				ext: DUMP_EXT[serviceType] as string,
				containerSearch,
			};
		case "mongo":
			return {
				command: getMongoInstanceDumpCommand(
					service.databaseUser as string,
					service.databasePassword as string,
				),
				ext: DUMP_EXT[serviceType] as string,
				containerSearch,
			};
		case "libsql":
			return {
				command: getLibsqlBackupCommand(LIBSQL_DATA_DIR),
				ext: DUMP_EXT[serviceType] as string,
				containerSearch,
			};
		default:
			return undefined;
	}
};

export const buildComposeDumpCommand = (
	backup: Record<string, unknown>,
): DumpCommand | undefined => {
	const command = generateBackupCommand({
		...backup,
		backupType: "compose",
	} as BackupSchedule);
	const ext = DUMP_EXT[backup.databaseType as string];
	if (!command || !ext) return undefined;
	return {
		command,
		ext,
		containerSearch: getComposeContainerCommand(
			backup.appName as string,
			(backup.serviceName as string | null) ?? "",
			backup.composeType as "stack" | "docker-compose" | undefined,
		),
	};
};

export const buildFullDumpScript = ({
	containerSearch,
	command,
}: DumpCommand): string =>
	`set -eo pipefail; CONTAINER_ID=$(${containerSearch}); if [ -z "$CONTAINER_ID" ]; then echo "Container not found" >&2; exit 1; fi; ${command}`;

export type RunDumpToFile = (
	serverId: string | null,
	dumpCommand: DumpCommand,
	target: Location,
) => Promise<void>;

export const runDumpToFile: RunDumpToFile = (serverId, dumpCommand, target) =>
	runToFile(serverId, buildFullDumpScript(dumpCommand), target);

export type CreateDumpsOptions = {
	emit?: Emit;
	runDump?: RunDumpToFile;
};

export const createDumps = async (
	db: TransferDb,
	tree: ProjectTree,
	scope: ExportScope,
	workDir: Location,
	opts: CreateDumpsOptions = {},
): Promise<{ dumps: DumpIndex[]; warnings: Warning[] }> => {
	const emit = opts.emit ?? (() => {});
	const runDump = opts.runDump ?? runDumpToFile;
	const dumps: DumpIndex[] = [];
	const warnings: Warning[] = [];

	if (scope.dumps.mode === "none") {
		return { dumps, warnings };
	}

	const dumpsDir = at(workDir, "dumps");
	if (scope.dumps.mode === "embed") {
		await mkdirp(dumpsDir);
	}

	for (const { serviceType, environmentId, service } of scopedServices(
		tree,
		scope,
	)) {
		const serverId = (service.serverId as string | null) ?? null;
		const appName = service.appName as string;

		if (serviceType === "compose") {
			const composeId = service[SERVICE_ID_FIELD.compose] as string;
			const backups = (service.backups as Record<string, unknown>[]) ?? [];
			for (const backup of backups) {
				const dumpCountBefore = dumps.length;
				await dumpOne(db, scope, dumpsDir, emit, runDump, dumps, warnings, {
					serviceType: "compose",
					serviceId: composeId,
					fileKey: backup.backupId as string,
					environmentId,
					appName,
					serverId,
					built: buildComposeDumpCommand(backup),
					backupIds: [backup.backupId as string],
				});
				if (dumps.length === dumpCountBefore) {
					continue;
				}
				warnings.push({
					code: "COMPOSE_DUMP_NOT_RESTORABLE",
					severity: "warning",
					message: `The dump for compose service "${appName}" will be included in the bundle, but compose dumps can't be restored automatically on import; it will need to be restored manually.`,
					affected: [
						{
							serviceId: composeId,
							serviceType: "compose",
							serviceName: appName,
							environmentId,
						},
					],
				});
			}
			continue;
		}

		if (!DUMPABLE_DB_TYPES.includes(serviceType)) {
			continue;
		}

		const serviceId = service[SERVICE_ID_FIELD[serviceType]] as string;
		const backupIds = (
			(service.backups as Record<string, unknown>[] | undefined) ?? []
		).map((b) => b.backupId as string);
		const dumpCountBefore = dumps.length;
		await dumpOne(db, scope, dumpsDir, emit, runDump, dumps, warnings, {
			serviceType,
			serviceId,
			environmentId,
			appName,
			serverId,
			built: buildDumpCommand(serviceType, service),
			backupIds,
		});
		if (serviceType === "mongo" && dumps.length > dumpCountBefore) {
			warnings.push({
				code: "MONGO_ADMIN_USERS_NOT_RESTORED",
				severity: "info",
				message: `The mongo dump for "${appName}" restores every database except admin and config, so extra users or roles defined there are not recreated; only the root credentials stored in Dokploy are.`,
				affected: [
					{ serviceId, serviceType, serviceName: appName, environmentId },
				],
			});
		}
	}

	if (!dumps.some((dump) => dump.mode === "embed")) {
		await remove(dumpsDir).catch(() => {});
	}
	return { dumps, warnings };
};

type DumpOneOptions = {
	serviceType: ServiceType;
	serviceId: string;
	fileKey?: string;
	environmentId: string;
	appName: string;
	serverId: string | null;
	built: DumpCommand | undefined;
	backupIds: string[];
};

const dumpOne = async (
	db: TransferDb,
	scope: ExportScope,
	dumpsDir: Location,
	emit: Emit,
	runDump: RunDumpToFile,
	dumps: DumpIndex[],
	warnings: Warning[],
	{
		serviceType,
		serviceId,
		fileKey,
		environmentId,
		appName,
		serverId,
		built,
		backupIds,
	}: DumpOneOptions,
) => {
	if (!built) {
		return;
	}
	const key = fileKey ?? serviceId;
	const usedBy: UsedBy = {
		serviceId,
		serviceType,
		serviceName: appName,
		environmentId,
	};

	if (scope.dumps.mode === "embed") {
		const target = at(dumpsDir, `${key}.${built.ext}`);
		try {
			await runDump(serverId, built, target);
			const size = await fileSize(target);
			if (size > MAX_EMBEDDED_DUMP_BYTES) {
				await remove(target);
				warnings.push({
					code: "DUMP_SKIPPED_TOO_LARGE",
					severity: "warning",
					message: `Dump for "${appName}" is ${size} bytes, over the ${MAX_EMBEDDED_DUMP_BYTES} byte embed limit; skipped.`,
					affected: [usedBy],
				});
				return;
			}
			dumps.push({
				serviceId,
				serviceType,
				mode: "embed",
				ext: built.ext,
				path: `dumps/${key}.${built.ext}`,
				bytes: size,
			});
			emit(`Dumped ${serviceType} "${appName}" (${size} bytes)`);
		} catch (error) {
			const detail = safeErrorMessage(error);
			emit(`Failed to dump ${serviceType} "${appName}": ${detail}`);
			warnings.push({
				code: "DUMP_FAILED",
				severity: "warning",
				message: `Dump for "${appName}" failed: ${detail}`,
				affected: [usedBy],
			});
			await remove(target).catch(() => {});
		}
		return;
	}

	if (backupIds.length === 0) {
		return;
	}
	const lastSuccessful = await db.query.deployments.findMany({
		where: (fields, { inArray, eq, and }) =>
			and(inArray(fields.backupId, backupIds), eq(fields.status, "done")),
		orderBy: (fields, { desc }) => desc(fields.createdAt),
		limit: 1,
	});
	const deployment = lastSuccessful[0];
	if (!deployment) {
		return;
	}
	const backupRow = await db.query.backups.findFirst({
		where: (fields, { eq }) =>
			eq(fields.backupId, deployment.backupId as string),
	});
	if (!backupRow) {
		return;
	}
	dumps.push({
		serviceId,
		serviceType,
		mode: "referenceLastBackup",
		destinationId: backupRow.destinationId,
		keyPrefix: `${appName}/${backupRow.prefix.replace(/^\/+|\/+$/g, "")}/`,
	});
};
