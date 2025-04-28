import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Compose } from "@dokploy/server/services/compose";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getS3Credentials, normalizeS3Path } from "./utils";

export const runComposeBackup = async (
	compose: Compose,
	backup: BackupSchedule,
) => {
	const { projectId, name } = compose;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;

	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		const command = `docker ps --filter "status=running" --filter "label=dokploy.backup.id=${backup.backupId}" --format "{{.ID}}" | head -n 1`;
		if (compose.serverId) {
			const { stdout } = await execAsyncRemote(compose.serverId, command);
			if (!stdout) {
				throw new Error("Container not found");
			}
			const containerId = stdout.trim();

			let backupCommand = "";

			if (backup.databaseType === "postgres") {
				backupCommand = `docker exec ${containerId} sh -c "pg_dump -Fc --no-acl --no-owner -h localhost -U ${backup.metadata?.postgres?.databaseUser} --no-password '${database}' | gzip"`;
			} else if (backup.databaseType === "mariadb") {
				backupCommand = `docker exec ${containerId} sh -c "mariadb-dump --user='${backup.metadata?.mariadb?.databaseUser}' --password='${backup.metadata?.mariadb?.databasePassword}' --databases ${database} | gzip"`;
			} else if (backup.databaseType === "mysql") {
				backupCommand = `docker exec ${containerId} sh -c "mysqldump --default-character-set=utf8mb4 -u 'root' --password='${backup.metadata?.mysql?.databaseRootPassword}' --single-transaction --no-tablespaces --quick '${database}' | gzip"`;
			} else if (backup.databaseType === "mongo") {
				backupCommand = `docker exec ${containerId} sh -c "mongodump -d '${database}' -u '${backup.metadata?.mongo?.databaseUser}' -p '${backup.metadata?.mongo?.databasePassword}' --archive --authenticationDatabase admin --gzip"`;
			}

			await execAsyncRemote(
				compose.serverId,
				`${backupCommand} | ${rcloneCommand}`,
			);
		} else {
			const { stdout } = await execAsync(command);
			if (!stdout) {
				throw new Error("Container not found");
			}
			const containerId = stdout.trim();

			let backupCommand = "";

			if (backup.databaseType === "postgres") {
				backupCommand = `docker exec ${containerId} sh -c "pg_dump -Fc --no-acl --no-owner -h localhost -U ${backup.metadata?.postgres?.databaseUser} --no-password '${database}' | gzip"`;
			} else if (backup.databaseType === "mariadb") {
				backupCommand = `docker exec ${containerId} sh -c "mariadb-dump --user='${backup.metadata?.mariadb?.databaseUser}' --password='${backup.metadata?.mariadb?.databasePassword}' --databases ${database} | gzip"`;
			} else if (backup.databaseType === "mysql") {
				backupCommand = `docker exec ${containerId} sh -c "mysqldump --default-character-set=utf8mb4 -u 'root' --password='${backup.metadata?.mysql?.databaseRootPassword}' --single-transaction --no-tablespaces --quick '${database}' | gzip"`;
			} else if (backup.databaseType === "mongo") {
				backupCommand = `docker exec ${containerId} sh -c "mongodump -d '${database}' -u '${backup.metadata?.mongo?.databaseUser}' -p '${backup.metadata?.mongo?.databasePassword}' --archive --authenticationDatabase admin --gzip"`;
			}

			await execAsync(`${backupCommand} | ${rcloneCommand}`);
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "success",
			organizationId: project.organizationId,
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
		});
		throw error;
	}
};
