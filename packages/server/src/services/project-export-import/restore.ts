import type { Destination } from "@dokploy/server/services/destination";
import { deployLibsql } from "@dokploy/server/services/libsql";
import { deployMariadb } from "@dokploy/server/services/mariadb";
import { deployMongo } from "@dokploy/server/services/mongo";
import { deployMySql } from "@dokploy/server/services/mysql";
import { deployPostgres } from "@dokploy/server/services/postgres";
import {
	getS3Credentials,
	getServiceContainerCommand,
} from "@dokploy/server/utils/backups/utils";
import { sleep } from "@dokploy/server/utils/process/execAsync";
import { getRestoreCommand } from "@dokploy/server/utils/restore/utils";
import { quote } from "shell-quote";
import { assertSafeBundlePath } from "./deserialize";
import { DUMP_EXT, LIBSQL_DATA_DIR } from "./dumps";
import type { TransferDb } from "./queries";
import {
	at,
	copyFile,
	escapeShellArg,
	type Location,
	remove,
	run,
	safeErrorMessage,
} from "./remote-fs";
import type { Emit, RestoreError, Snapshot, TransferResult } from "./types";

export type RestorableKind =
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "libsql";

export const RESTORABLE_KINDS: RestorableKind[] = [
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"libsql",
];

export type DeployFn = (
	id: string,
	onData?: (data: unknown) => void,
) => Promise<unknown>;

export const DEPLOY_FN: Record<RestorableKind, DeployFn> = {
	postgres: deployPostgres,
	mysql: deployMySql,
	mariadb: deployMariadb,
	mongo: deployMongo,
	libsql: deployLibsql,
};

export type Row = Record<string, unknown>;

export const buildReadyProbe = (kind: RestorableKind, row: Row): string => {
	const user = quote([String(row.databaseUser ?? "")]);
	const database = quote([String(row.databaseName ?? "")]);
	switch (kind) {
		case "postgres":
			return `psql -U ${user} -d ${database} -tAc "SELECT 1"`;
		case "mysql":
			return `mysql -uroot --password=${quote([String(row.databaseRootPassword ?? "")])} -N -s -e "SELECT 1"`;
		case "mariadb":
			return `mariadb -u${user} --password=${quote([String(row.databasePassword ?? "")])} -N -s -e "SELECT 1"`;
		case "mongo": {
			const args = `--quiet -u ${user} -p ${quote([String(row.databasePassword ?? "")])} --authenticationDatabase admin --eval "db.adminCommand({ping: 1}).ok"`;
			return `if command -v mongosh >/dev/null 2>&1; then mongosh ${args}; else mongo ${args}; fi`;
		}
		case "libsql":
			return `test -d /var/lib/sqld/${LIBSQL_DATA_DIR}`;
	}
};

export const buildWaitReadyScript = (
	appName: string,
	probeCommand: string,
): string =>
	`CONTAINER_ID=$(${getServiceContainerCommand(appName)}); if [ -z "$CONTAINER_ID" ]; then exit 1; fi; docker exec "$CONTAINER_ID" sh -c ${quote([probeCommand])}`;

export const waitUntilReady = async (
	serverId: string | null,
	appName: string,
	probeCommand: string,
	{
		timeoutMs = 300_000,
		intervalMs = 2000,
		stableSuccesses = 3,
	}: ReadinessOptions = {},
): Promise<void> => {
	const script = buildWaitReadyScript(appName, probeCommand);
	const deadline = Date.now() + timeoutMs;
	let successes = 0;
	while (Date.now() < deadline) {
		try {
			await run(serverId, script);
			successes += 1;
			if (successes >= stableSuccesses) return;
		} catch {
			successes = 0;
		}
		await sleep(intervalMs);
	}
	throw new Error(
		`Timed out waiting for ${appName} to become ready for restore`,
	);
};

export const buildRestoreCommand = (
	kind: RestorableKind,
	row: Row,
	dumpPath: string,
): string => {
	const appName = row.appName as string;
	const credentials = {
		database: (row.databaseName as string) ?? "",
		databaseUser: row.databaseUser as string | undefined,
		databasePassword:
			kind === "mysql"
				? (row.databaseRootPassword as string | undefined)
				: (row.databasePassword as string | undefined),
	};

	if (kind === "libsql") {
		const sqldDir = `/var/lib/sqld/${LIBSQL_DATA_DIR}`;
		return `CONTAINER_ID=$(${getServiceContainerCommand(appName)}) && docker exec -i "$CONTAINER_ID" sh -c ${quote([`rm -rf ${sqldDir} && tar xzf - -C /var/lib/sqld`])} < ${escapeShellArg(dumpPath)} && docker service update --force ${escapeShellArg(appName)}`;
	}

	if (kind === "mongo") {
		return `CONTAINER_ID=$(${getServiceContainerCommand(appName)}) && docker exec -e DB_USER=${quote([credentials.databaseUser ?? ""])} -e DB_PASS=${quote([credentials.databasePassword ?? ""])} -i "$CONTAINER_ID" sh -c ${quote(['mongorestore -u "$DB_USER" -p "$DB_PASS" --authenticationDatabase admin --nsExclude "admin.*" --nsExclude "config.*" --archive --gzip --drop'])} < ${escapeShellArg(dumpPath)}`;
	}

	return getRestoreCommand({
		appName,
		type: kind,
		restoreType: "database",
		credentials,
		rcloneCommand: `gunzip -c ${escapeShellArg(dumpPath)}`,
	});
};

const downloadLatestFromPrefix = async (
	destination: Destination,
	keyPrefix: string,
	localPath: string,
	serverId: string | null,
): Promise<void> => {
	const flags = getS3Credentials(destination);
	const bucketPrefix = `:s3:${destination.bucket}/${keyPrefix}`;

	const { stdout } = await run(
		serverId,
		`rclone lsf ${flags.join(" ")} --files-only ${quote([bucketPrefix])}`,
	);
	const objects = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.sort();
	const latest = objects.at(-1);
	if (!latest) {
		throw new Error(`No backup objects found under ${keyPrefix}`);
	}

	await run(
		serverId,
		`rclone copyto ${flags.join(" ")} ${quote([`${bucketPrefix}${latest}`])} ${quote([localPath])}`,
	);
};

export type ReadinessOptions = {
	timeoutMs?: number;
	intervalMs?: number;
	stableSuccesses?: number;
};

export type RestoreDumpsOptions = {
	emit?: Emit;
	deploy?: Partial<Record<RestorableKind, DeployFn>>;
	readiness?: ReadinessOptions;
	skipServiceIds?: Set<string>;
};

export const restoreDumps = async (
	db: TransferDb,
	snapshot: Snapshot,
	result: TransferResult,
	workDir: Location,
	opts: RestoreDumpsOptions = {},
): Promise<RestoreError[]> => {
	const emit = opts.emit ?? (() => {});
	const deploy = { ...DEPLOY_FN, ...opts.deploy };
	const restoreErrors: RestoreError[] = [];

	const serviceNameOf = (
		dump: Snapshot["dumps"][number],
	): string | undefined => {
		const service = snapshot.resources.services.find(
			(row) =>
				row.kind === dump.serviceType &&
				row[`${dump.serviceType}Id`] === dump.serviceId,
		);
		return (
			(service?.name as string | undefined) ??
			(service?.appName as string | undefined)
		);
	};

	for (const dump of snapshot.dumps) {
		const kind = dump.serviceType as RestorableKind;
		const serviceName = serviceNameOf(dump);
		if (!RESTORABLE_KINDS.includes(kind)) {
			restoreErrors.push({
				serviceId: dump.serviceId,
				serviceName,
				error: `${dump.serviceType}: the dump is in the bundle but automatic restore isn't supported for this engine; restore it manually`,
			});
			continue;
		}

		const newServiceId = result.idMap[kind]?.[dump.serviceId];
		if (!newServiceId) {
			restoreErrors.push({
				serviceId: dump.serviceId,
				serviceName,
				error: "Service was not imported (a required dependency was skipped)",
			});
			continue;
		}
		if (opts.skipServiceIds?.has(newServiceId)) {
			restoreErrors.push({
				serviceId: newServiceId,
				serviceName,
				error:
					"Dump not restored because the service's files could not be written",
			});
			continue;
		}

		try {
			const row = await (
				db.query[kind] as {
					findFirst: (args: unknown) => Promise<Row | undefined>;
				}
			).findFirst({
				where: (
					fields: Row,
					{ eq }: { eq: (a: unknown, b: unknown) => unknown },
				) => eq((fields as Record<string, unknown>)[`${kind}Id`], newServiceId),
			});
			if (!row) {
				throw new Error("Imported row not found");
			}
			const appName = row.appName as string;
			const serverId = (row.serverId as string | null) ?? null;

			emit(`Deploying ${appName}...`);
			await deploy[kind](newServiceId, (data) => emit(String(data)));

			emit(`Waiting for ${appName} to accept connections...`);
			await waitUntilReady(
				serverId,
				appName,
				buildReadyProbe(kind, row),
				opts.readiness,
			);

			let remoteDumpPath = `/tmp/dokploy-import-restore-${newServiceId}.${
				dump.mode === "embed" ? dump.ext : DUMP_EXT[kind]
			}`;
			let cleanupDump = true;

			try {
				if (dump.mode === "embed") {
					assertSafeBundlePath(dump.path, dump.path);
					const local = at(workDir, dump.path);
					if (local.serverId === serverId) {
						remoteDumpPath = local.path;
						cleanupDump = false;
					} else {
						await copyFile(local, { serverId, path: remoteDumpPath });
					}
				} else {
					const destinationId = result.idMap.destination?.[dump.destinationId];
					if (!destinationId) {
						throw new Error("Destination requirement was not resolved");
					}
					const destination = await db.query.destinations.findFirst({
						where: (fields, { eq }) => eq(fields.destinationId, destinationId),
					});
					if (!destination) {
						throw new Error("Resolved destination no longer exists");
					}
					await downloadLatestFromPrefix(
						destination,
						dump.keyPrefix,
						remoteDumpPath,
						serverId,
					);
				}

				emit(`Restoring ${appName}...`);
				await run(serverId, buildRestoreCommand(kind, row, remoteDumpPath));
				emit(`Restored ${appName}`);
			} finally {
				if (cleanupDump) {
					await remove({ serverId, path: remoteDumpPath }).catch(() => {});
				}
			}
		} catch (error) {
			restoreErrors.push({
				serviceId: dump.serviceId,
				serviceName,
				error: safeErrorMessage(error),
			});
		}
	}

	return restoreErrors;
};
