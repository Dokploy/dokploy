import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { MySql } from "@dokploy/server/services/mysql";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsyncRemote, execAsyncStream } from "../process/execAsync";
import {
	getMysqlBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";
import { createWriteStream } from "node:fs";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { appName, databaseRootPassword, projectId, name } = mysql;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MySQL Backup",
		description: "MySQL Backup",
	});
	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const { Id: containerId } = await getServiceContainer(
			appName,
			mysql.serverId,
		);

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		const command = getMysqlBackupCommand(
			containerId,
			database,
			databaseRootPassword || "",
		);
		if (mysql.serverId) {
			await execAsyncRemote(
				mysql.serverId,
				`
				set -e;
				echo "Running command." >> ${deployment.logPath};
				export RCLONE_LOG_LEVEL=DEBUG;
				${command} | ${rcloneCommand} >> ${deployment.logPath} 2>> ${deployment.logPath} || {
					echo "❌ Command failed" >> ${deployment.logPath};
					exit 1;
				}
				echo "✅ Command executed successfully" >> ${deployment.logPath};
				`,
			);
		} else {
			const writeStream = createWriteStream(deployment.logPath, { flags: "a" });
			await execAsyncStream(
				`${command} | ${rcloneCommand}`,
				(data) => {
					if (writeStream.writable) {
						writeStream.write(data);
					}
				},
				{
					env: {
						...process.env,
						RCLONE_LOG_LEVEL: "DEBUG",
					},
				},
			);
			writeStream.write("Backup done✅");
			writeStream.end();
		}
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
