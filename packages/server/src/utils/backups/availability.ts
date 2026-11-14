import type { BackupSchedule } from "@dokploy/server/services/backup";
import { quote } from "shell-quote";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	type ComposeBackupInput,
	getDatabaseReadinessCommand,
} from "./compose-command";
import { getContainerSearchCommand } from "./utils";

export type BackupAvailability = {
	available: boolean;
	reason: string | null;
};

const unavailable = (reason: string): BackupAvailability => ({
	available: false,
	reason,
});

/** Native backups must use the same credentials as their existing dump command. */
const getConnection = (backup: BackupSchedule): ComposeBackupInput => {
	if (backup.backupType === "compose") return backup;
	switch (backup.databaseType) {
		case "postgres":
			return {
				...backup,
				metadata: { postgres: { databaseUser: backup.postgres?.databaseUser } },
			};
		case "mysql":
			return {
				...backup,
				metadata: {
					mysql: { databaseRootPassword: backup.mysql?.databaseRootPassword },
				},
			};
		case "mariadb":
			return {
				...backup,
				metadata: {
					mariadb: {
						databaseUser: backup.mariadb?.databaseUser,
						databasePassword: backup.mariadb?.databasePassword,
					},
				},
			};
		case "mongo":
			return {
				...backup,
				metadata: {
					mongo: {
						databaseUser: backup.mongo?.databaseUser,
						databasePassword: backup.mongo?.databasePassword,
					},
				},
			};
		default:
			return backup;
	}
};

/** Readiness never runs user scripts, creates deployments or contacts S3. */
export const getBackupAvailability = async (
	backup: BackupSchedule,
): Promise<BackupAvailability> => {
	const service =
		backup.backupType === "compose"
			? backup.compose
			: (backup.postgres ??
				backup.mysql ??
				backup.mariadb ??
				backup.mongo ??
				backup.libsql);
	if (!service || (backup.backupType === "compose" && !backup.serviceName)) {
		return unavailable(
			"Start the selected service before running a manual backup.",
		);
	}
	try {
		const probe =
			backup.databaseType === "libsql"
				? `docker exec "$CONTAINER_ID" test -r ${quote([`/var/lib/sqld/${backup.database}`])}`
				: getDatabaseReadinessCommand(getConnection(backup));
		const script = `set -e;
CONTAINER_ID=$(${getContainerSearchCommand(backup)});
if [ -z "$CONTAINER_ID" ]; then printf 'stopped'; exit 0; fi;
STATE=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER_ID");
case "$STATE" in
  'running '|'running healthy') ;;
  *) printf 'unhealthy'; exit 0 ;;
esac;
if ${probe} >/dev/null 2>&1; then printf 'ready'; else printf 'unavailable'; fi`;
		const result = service.serverId
			? await execAsyncRemote(service.serverId, script)
			: await execAsync(script, { shell: "/bin/bash" });
		switch (result.stdout.trim()) {
			case "ready":
				return { available: true, reason: null };
			case "stopped":
				return unavailable(
					"Start the selected service before running a manual backup.",
				);
			case "unhealthy":
				return unavailable(
					"Wait for the selected service to be running and healthy before running a manual backup.",
				);
			case "unavailable":
				return unavailable(
					"The database is unavailable. Check its host, port, credentials and backup tools before running a manual backup.",
				);
			default:
				throw new Error("Unexpected readiness result");
		}
	} catch {
		// Exec errors contain commands and credentials. Only return a fixed message.
		return unavailable(
			"Could not check backup availability. Check the service and server connection.",
		);
	}
};

export class BackupUnavailableError extends Error {}

export const assertBackupAvailable = async (backup: BackupSchedule) => {
	const status = await getBackupAvailability(backup);
	if (!status.available)
		throw new BackupUnavailableError(
			status.reason ?? "The database is unavailable.",
		);
};
