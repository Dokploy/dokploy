import { paths } from "@dokploy/server/constants";
import { getServiceContainerCommand } from "@dokploy/server/utils/backups/utils";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { DUMPABLE_DB_TYPES, LIBSQL_DATA_DIR } from "./dumps";
import type { ProjectTree } from "./queries";
import { escapeShellArg } from "./remote-fs";
import { scopedServices } from "./service-kinds";
import type { ExportScope, ServiceType } from "./types";

export type RunSizeProbe = (
	serverId: string | null,
	command: string,
) => Promise<string>;

const defaultProbe: RunSizeProbe = async (serverId, command) => {
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);
	return stdout;
};

const inContainer = (appName: string, envs: string, script: string) =>
	`CONTAINER_ID=$(${getServiceContainerCommand(appName)}); if [ -z "$CONTAINER_ID" ]; then exit 1; fi; docker exec ${envs} -i "$CONTAINER_ID" sh -c ${quote([script])}`;

export const buildDatabaseSizeCommand = (
	serviceType: ServiceType,
	service: Record<string, unknown>,
): string | undefined => {
	const appName = service.appName as string;
	const env = (name: string, value: unknown) =>
		`-e ${name}=${quote([String(value ?? "")])}`;
	switch (serviceType) {
		case "postgres":
			return inContainer(
				appName,
				`${env("DB_NAME", service.databaseName)} ${env("DB_USER", service.databaseUser)}`,
				'psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT pg_database_size(current_database())"',
			);
		case "mysql":
			return inContainer(
				appName,
				`${env("DB_NAME", service.databaseName)} ${env("DB_PASS", service.databaseRootPassword)}`,
				'mysql -uroot --password="$DB_PASS" -N -s "$DB_NAME" -e "SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema=DATABASE()"',
			);
		case "mariadb":
			return inContainer(
				appName,
				`${env("DB_NAME", service.databaseName)} ${env("DB_USER", service.databaseUser)} ${env("DB_PASS", service.databasePassword)}`,
				'mariadb -u"$DB_USER" --password="$DB_PASS" -N -s "$DB_NAME" -e "SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema=DATABASE()"',
			);
		case "mongo":
			return inContainer(
				appName,
				`${env("DB_USER", service.databaseUser)} ${env("DB_PASS", service.databasePassword)}`,
				'mongosh --quiet -u "$DB_USER" -p "$DB_PASS" --authenticationDatabase admin --eval "db.getMongo().getDBNames().filter(function(n){return !/^(admin|config|local)$/.test(n)}).reduce(function(s,n){return s+db.getSiblingDB(n).stats().dataSize},0)"',
			);
		case "libsql":
			return inContainer(
				appName,
				env("DB_NAME", LIBSQL_DATA_DIR),
				'du -sk "/var/lib/sqld/$DB_NAME" | awk "{print \\$1*1024}"',
			);
		default:
			return undefined;
	}
};

export const buildDirectorySizeCommand = (path: string): string =>
	`du -sk ${escapeShellArg(path)} | awk '{print $1*1024}'`;

const parseBytes = (output: string): number => {
	const value = Number.parseInt(output.trim().split("\n").at(-1) ?? "", 10);
	return Number.isFinite(value) && value > 0 ? value : 0;
};

const safeProbe = async (
	probe: RunSizeProbe,
	serverId: string | null,
	command: string | undefined,
): Promise<number> => {
	if (!command) return 0;
	try {
		return parseBytes(await probe(serverId, command));
	} catch {
		return 0;
	}
};

export type EstimateSizesOptions = {
	probe?: RunSizeProbe;
	pathsFn?: typeof paths;
};

export const estimateSizes = async (
	tree: ProjectTree,
	scope: ExportScope,
	opts: EstimateSizesOptions = {},
): Promise<{ estimatedDumpBytes: number; estimatedFilesBytes: number }> => {
	const probe = opts.probe ?? defaultProbe;
	const pathsFn = opts.pathsFn ?? paths;
	const dumpJobs: Promise<number>[] = [];
	const fileJobs: Promise<number>[] = [];

	for (const { serviceType, service } of scopedServices(tree, scope)) {
		const serverId = (service.serverId as string | null) ?? null;
		const appName = service.appName as string | undefined;
		if (!appName) continue;
		if (
			scope.dumps.mode === "embed" &&
			DUMPABLE_DB_TYPES.includes(serviceType)
		) {
			dumpJobs.push(
				safeProbe(
					probe,
					serverId,
					buildDatabaseSizeCommand(serviceType, service),
				),
			);
		}
		const remotePaths = pathsFn(serverId !== null);
		if (serviceType === "application" && scope.files.applicationSources) {
			fileJobs.push(
				safeProbe(
					probe,
					serverId,
					buildDirectorySizeCommand(
						`${remotePaths.APPLICATIONS_PATH}/${appName}`,
					),
				),
			);
		}
		if (serviceType === "compose" && scope.files.composeFiles) {
			fileJobs.push(
				safeProbe(
					probe,
					serverId,
					buildDirectorySizeCommand(`${remotePaths.COMPOSE_PATH}/${appName}`),
				),
			);
		}
	}

	const [dumpSizes, fileSizes] = await Promise.all([
		Promise.all(dumpJobs),
		Promise.all(fileJobs),
	]);
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
	return {
		estimatedDumpBytes: sum(dumpSizes),
		estimatedFilesBytes: sum(fileSizes),
	};
};
