import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type {
	cloudStorageBackup,
	cloudStorageDestination,
} from "@dokploy/server/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { execAsync } from "../process/execAsync";

type CloudStorageDestination = InferSelectModel<typeof cloudStorageDestination>;
type CloudStorageBackup = InferSelectModel<typeof cloudStorageBackup> & {
	postgres?: { host: string; port: number; user: string; password: string };
	mysql?: { host: string; port: number; user: string; password: string };
	mariadb?: { host: string; port: number; user: string; password: string };
	mongo?: { host: string; port: number; user: string; password: string };
	webServer?: { path: string };
};
export type CloudStorageProvider = "drive" | "dropbox" | "box" | "ftp" | "sftp";

export const normalizeCloudPath = (path: string): string => {
	const normalized = path.replace(/\/+/g, "/").trim();
	const cleaned = normalized.replace(/^\/+|\/+$/g, "");
	return cleaned ? `${cleaned}/` : "";
};

export const isCloudStorage = (provider?: string): boolean => {
	return ["drive", "dropbox", "box", "ftp", "sftp"].includes(provider || "");
};

export const getCloudStorageCredentials = async (
	destination: CloudStorageDestination,
): Promise<string[]> => {
	const { provider, config } = destination;
	const credentials: string[] = [];

	try {
		switch (provider) {
			case "drive":
			case "dropbox":
			case "box": {
				const configDir = join(homedir(), ".config", "rclone");
				await mkdir(configDir, { recursive: true });

				const configFile = join(configDir, "rclone.conf");
				let configContent = "";

				const parsedOAuthConfig = JSON.parse(config || "{}");

				switch (provider) {
					case "drive":
						if (!parsedOAuthConfig.token) {
							throw new Error("Google Drive OAuth token is missing");
						}
						configContent = `[drive]
type = drive
token = ${parsedOAuthConfig.token}
`;
						break;
					case "dropbox":
						if (!parsedOAuthConfig.token) {
							throw new Error("Dropbox OAuth token is missing");
						}
						configContent = `[dropbox]
type = dropbox
token = ${parsedOAuthConfig.token}
`;
						break;
					case "box":
						if (!parsedOAuthConfig.token) {
							throw new Error("Box OAuth token is missing");
						}
						configContent = `[box]
type = box
token = ${parsedOAuthConfig.token}
`;
						break;
				}

				await writeFile(configFile, configContent, "utf8");
				credentials.push(`--config=${configFile}`);
				break;
			}

			case "ftp":
			case "sftp": {
				const ftpConfigDir = join(homedir(), ".config", "rclone");
				await mkdir(ftpConfigDir, { recursive: true });

				const ftpConfigFile = join(ftpConfigDir, "rclone.conf");
				let ftpConfigContent = "";

				const parsedFtpConfig = JSON.parse(config || "{}");
				const { host, username, password, port } = parsedFtpConfig;

				if (!username || !password || !host) {
					throw new Error(`${provider.toUpperCase()} credentials are missing`);
				}

				ftpConfigContent = `[${provider}]
type = ${provider}
host = ${host}
user = ${username}
pass = ${password}
${port ? `port = ${port}` : ""}
mkdir = true
dir_perms = 0755
file_perms = 0644
concurrency = 4
transfers = 4
checkers = 4
low_level_retries = 10
retries = 3
retries_sleep = 10s
${
	provider === "ftp"
		? `
allow_writeable_chroot = true
passive = true
encoding = Slash,Del,Ctl,RightSpace,Dot`
		: ""
}`;

				await writeFile(ftpConfigFile, ftpConfigContent, "utf8");
				credentials.push(`--config=${ftpConfigFile}`);
				break;
			}

			default:
				throw new Error(`Unsupported cloud storage provider: ${provider}`);
		}
	} catch (error) {
		console.error("Error parsing cloud storage config:", error);
		throw new Error("Invalid cloud storage configuration");
	}

	return credentials;
};

export const executeCloudStorageBackup = async (
	backup: CloudStorageBackup,
	destination: CloudStorageDestination,
): Promise<void> => {
	try {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const filename = `${backup.database || "backup"}-${timestamp}.sql.gz`;
		const tempDir = `/tmp/dokploy-backup-${Date.now()}`;

		await execAsync(`rm -rf ${tempDir}`);
		await execAsync(`mkdir -p ${tempDir}`);

		try {
			let backupCommand = "";
			switch (backup.databaseType) {
				case "postgres":
					if (!backup.postgres)
						throw new Error("PostgreSQL configuration missing");
					backupCommand = `PGPASSWORD="${backup.postgres.password}" pg_dump -h ${backup.postgres.host} -p ${backup.postgres.port} -U ${backup.postgres.user} -d ${backup.database} | gzip > ${tempDir}/${filename}`;
					break;
				case "mysql":
					if (!backup.mysql) throw new Error("MySQL configuration missing");
					backupCommand = `mysqldump -h ${backup.mysql.host} -P ${backup.mysql.port} -u ${backup.mysql.user} -p${backup.mysql.password} ${backup.database} | gzip > ${tempDir}/${filename}`;
					break;
				case "mariadb":
					if (!backup.mariadb) throw new Error("MariaDB configuration missing");
					backupCommand = `mysqldump -h ${backup.mariadb.host} -P ${backup.mariadb.port} -u ${backup.mariadb.user} -p${backup.mariadb.password} ${backup.database} | gzip > ${tempDir}/${filename}`;
					break;
				case "mongo":
					if (!backup.mongo) throw new Error("MongoDB configuration missing");
					backupCommand = `mongodump --host ${backup.mongo.host} --port ${backup.mongo.port} --username ${backup.mongo.user} --password ${backup.mongo.password} --db ${backup.database} --archive --gzip > ${tempDir}/${filename}`;
					break;
				case "web-server": {
					const { BASE_PATH } = paths();
					const webServerFilename = `webserver-backup-${timestamp}.zip`;

					try {
						const { stdout: dirExists } = await execAsync(
							`test -d "${BASE_PATH}" && echo "exists" || echo "not exists"`,
						);
						if (dirExists.trim() === "not exists") {
							throw new Error(`Directory ${BASE_PATH} does not exist`);
						}

						await execAsync(`mkdir -p ${tempDir}/filesystem`);
						await execAsync(
							`rsync -a --ignore-errors ${BASE_PATH}/ ${tempDir}/filesystem/`,
						);

						const { stdout: containerId } = await execAsync(
							`docker ps --filter "name=dokploy-postgres" --filter "status=running" -q | head -n 1`,
						);

						if (containerId) {
							const postgresContainerId = containerId.trim();
							await execAsync(
								`docker exec ${postgresContainerId} pg_dump -v -Fc -U dokploy -d dokploy -f /tmp/database.sql`,
							);
							await execAsync(
								`docker cp ${postgresContainerId}:/tmp/database.sql ${tempDir}/database.sql`,
							);
							await execAsync(
								`docker exec ${postgresContainerId} rm -f /tmp/database.sql`,
							);
						}

						await execAsync(
							`cd ${tempDir} && zip -r ${webServerFilename} *.sql filesystem/ > /dev/null 2>&1`,
						);

						const normalizedPrefix = normalizeCloudPath(backup.prefix || "");
						const backupPath = `${destination.provider}:${normalizedPrefix}${webServerFilename}`;

						const credentials = await getCloudStorageCredentials(destination);
						const rcloneCommand = `rclone copyto ${credentials.join(" ")} "${tempDir}/${webServerFilename}" "${backupPath}"`;

						await execAsync(rcloneCommand);
						console.log(`Cloud storage backup completed: ${backupPath}`);
						return;
					} finally {
						await execAsync(`rm -rf ${tempDir}`);
					}
				}
				default:
					throw new Error(`Unsupported database type: ${backup.databaseType}`);
			}

			if (backupCommand) {
				await execAsync(backupCommand);
				const normalizedPrefix = normalizeCloudPath(backup.prefix || "");
				const backupPath = `${destination.provider}:${normalizedPrefix}${filename}`;

				const credentials = await getCloudStorageCredentials(destination);
				const rcloneCommand = `rclone copyto ${credentials.join(" ")} "${tempDir}/${filename}" "${backupPath}"`;
				console.log(`Executing rclone command: ${rcloneCommand}`);
				await execAsync(rcloneCommand);
				console.log(`Cloud storage backup completed: ${backupPath}`);
			}

			if (backup.keepLatestCount) {
				await keepLatestNCloudStorageBackups(
					backup,
					destination,
					backup.keepLatestCount,
				);
			}
		} finally {
			await execAsync(`rm -rf ${tempDir}`);
		}
	} catch (error) {
		console.error("Error during cloud storage backup:", error);
		throw error;
	}
};

export const executeCloudStorageRestore = async (
	backup: CloudStorageBackup,
	destination: CloudStorageDestination,
	backupPath: string,
	emit: (log: string) => void,
): Promise<void> => {
	try {
		const tempDir = `/tmp/dokploy-restore-${Date.now()}`;
		await execAsync(`mkdir -p ${tempDir}`);

		try {
			emit("Starting restore...");
			emit(`Backup path: ${backupPath}`);

			const fileName = backupPath.split("/").pop();
			if (!fileName) {
				throw new Error("Invalid backup file path");
			}

			emit("Downloading backup file...");
			const credentials = await getCloudStorageCredentials(destination);

			// Get just the filename without any provider prefix
			const cleanFileName = fileName.replace(/^[^:]+:/, "");

			// Construct the full path for the cloud storage provider
			const normalizedPrefix = normalizeCloudPath(backup.prefix || "");
			const fullPath = `${destination.provider}:${normalizedPrefix}${cleanFileName}`;

			const rcloneCommand = `rclone copyto ${credentials.join(" ")} "${fullPath}" "${tempDir}/${cleanFileName}"`;
			emit(`Executing rclone command: ${rcloneCommand}`);
			await execAsync(rcloneCommand);

			let restoreCommand = "";
			switch (backup.databaseType) {
				case "postgres":
					if (!backup.postgres)
						throw new Error("PostgreSQL configuration missing");
					emit("Restoring PostgreSQL database...");
					restoreCommand = `gunzip -c ${tempDir}/${cleanFileName} | psql -h ${backup.postgres.host} -p ${backup.postgres.port} -U ${backup.postgres.user} -d ${backup.database}`;
					break;
				case "mysql":
					if (!backup.mysql) throw new Error("MySQL configuration missing");
					emit("Restoring MySQL database...");
					restoreCommand = `gunzip -c ${tempDir}/${cleanFileName} | mysql -h ${backup.mysql.host} -P ${backup.mysql.port} -u ${backup.mysql.user} -p${backup.mysql.password} ${backup.database}`;
					break;
				case "mariadb":
					if (!backup.mariadb) throw new Error("MariaDB configuration missing");
					emit("Restoring MariaDB database...");
					restoreCommand = `gunzip -c ${tempDir}/${cleanFileName} | mysql -h ${backup.mariadb.host} -P ${backup.mariadb.port} -u ${backup.mariadb.user} -p${backup.mariadb.password} ${backup.database}`;
					break;
				case "mongo":
					if (!backup.mongo) throw new Error("MongoDB configuration missing");
					emit("Restoring MongoDB database...");
					restoreCommand = `mongorestore --host ${backup.mongo.host} --port ${backup.mongo.port} --username ${backup.mongo.user} --password ${backup.mongo.password} --db ${backup.database} --archive=${tempDir}/${cleanFileName} --gzip`;
					break;
				case "web-server": {
					if (!backup.webServer)
						throw new Error("Web server configuration missing");
					await execAsync(`mkdir -p ${backup.webServer.path}`);

					emit("Extracting backup...");
					await execAsync(
						`cd ${tempDir} && unzip ${cleanFileName} > /dev/null 2>&1`,
					);

					emit("Restoring filesystem...");
					emit(
						`Copying from ${tempDir}/filesystem/* to ${backup.webServer.path}/`,
					);

					emit("Cleaning target directory...");
					await execAsync(`rm -rf "${backup.webServer.path}/"*`);

					emit("Setting up target directory...");
					await execAsync(`mkdir -p "${backup.webServer.path}"`);

					emit("Copying files...");
					await execAsync(
						`cp -rp "${tempDir}/filesystem/"* "${backup.webServer.path}/"`,
					);

					emit("Starting database restore...");

					const { stdout: hasSqlFile } = await execAsync(
						`ls ${tempDir}/database.sql || true`,
					);
					if (hasSqlFile.includes("database.sql")) {
						const { stdout: postgresContainer } = await execAsync(
							`docker ps --filter "name=dokploy-postgres" --filter "status=running" -q | head -n 1`,
						);

						if (postgresContainer) {
							const postgresContainerId = postgresContainer.trim();

							emit("Disconnecting all users from database...");
							await execAsync(
								`docker exec ${postgresContainerId} psql -U dokploy postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'dokploy' AND pid <> pg_backend_pid();"`,
							);

							emit("Dropping existing database...");
							await execAsync(
								`docker exec ${postgresContainerId} psql -U dokploy postgres -c "DROP DATABASE IF EXISTS dokploy;"`,
							);

							emit("Creating fresh database...");
							await execAsync(
								`docker exec ${postgresContainerId} psql -U dokploy postgres -c "CREATE DATABASE dokploy;"`,
							);

							emit("Copying backup file into container...");
							await execAsync(
								`docker cp ${tempDir}/database.sql ${postgresContainerId}:/tmp/database.sql`,
							);

							emit("Running database restore...");
							await execAsync(
								`docker exec ${postgresContainerId} pg_restore -v -U dokploy -d dokploy /tmp/database.sql`,
							);

							emit("Cleaning up container temp file...");
							await execAsync(
								`docker exec ${postgresContainerId} rm /tmp/database.sql`,
							);
						}
					}
					break;
				}
				default:
					throw new Error(`Unsupported database type: ${backup.databaseType}`);
			}

			if (restoreCommand) {
				emit("Executing restore command...");
				await execAsync(restoreCommand);
			}

			emit("Restore completed successfully!");
		} finally {
			emit("Cleaning up temporary files...");
			await execAsync(`rm -rf ${tempDir}`);
		}
	} catch (error) {
		console.error("Error during cloud storage restore:", error);
		emit(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
		throw error;
	}
};

export const listCloudStorageFiles = async (
	destination: CloudStorageDestination,
	prefix: string | null,
	searchTerm?: string,
): Promise<
	Array<{
		path: string;
		size: number;
		isDir: boolean;
		hashes?: { MD5?: string };
	}>
> => {
	try {
		const credentials = await getCloudStorageCredentials(destination);
		const normalizedPrefix = normalizeCloudPath(prefix || "");
		const searchPattern = searchTerm ? `*${searchTerm}*` : "*";

		const rclonePath = (() => {
			switch (destination.provider) {
				case "drive":
					return `drive:${normalizedPrefix}${searchPattern}`;
				case "dropbox":
					return `dropbox:${normalizedPrefix}${searchPattern}`;
				case "box":
					return `box:${normalizedPrefix}${searchPattern}`;
				case "ftp":
				case "sftp":
					return `${destination.provider}:${normalizedPrefix}${searchPattern}`;
				default:
					throw new Error(
						`Unsupported cloud storage provider: ${destination.provider}`,
					);
			}
		})();

		const command = `rclone lsjson ${credentials.join(" ")} "${rclonePath}"`;
		const { stdout } = await execAsync(command);

		const files = JSON.parse(stdout) as Array<{
			Path: string;
			Size: number;
			IsDir: boolean;
			Hashes?: { MD5?: string };
		}>;

		return files.map((file) => ({
			path: file.Path,
			size: file.Size,
			isDir: file.IsDir,
			hashes: file.Hashes,
		}));
	} catch (error) {
		console.error("Error listing cloud storage files:", error);
		throw new Error("Failed to list backup files from cloud storage");
	}
};

export function getRcloneConfigPath(
	organizationId: string,
	destinationId: string,
): string {
	const configDir = join(
		homedir(),
		".dokploy",
		"rclone",
		"cloud",
		organizationId,
	);
	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}
	return join(configDir, `${destinationId}.conf`);
}
export const keepLatestNCloudStorageBackups = async (
	backup: CloudStorageBackup,
	destination: CloudStorageDestination,
	keepLatestCount: number,
) => {
	if (!keepLatestCount) return;

	try {
		const credentials = await getCloudStorageCredentials(destination);
		const normalizedPrefix = normalizeCloudPath(backup.prefix || "");
		const backupFilesPath = `${destination.provider}:${normalizedPrefix}`;

		const rcloneList = `rclone lsf ${credentials.join(" ")} --include "*${backup.databaseType === "web-server" ? ".zip" : ".sql.gz"}" ${backupFilesPath}`;
		const sortAndPickUnwantedBackups = `sort -r | tail -n +$((${keepLatestCount}+1)) | xargs -I{}`;
		const rcloneDelete = `rclone delete ${credentials.join(" ")} ${backupFilesPath}/{}`;

		const rcloneCommand = `${rcloneList} | ${sortAndPickUnwantedBackups} ${rcloneDelete}`;

		await execAsync(rcloneCommand);
	} catch (error) {
		console.error("Error keeping latest backups:", error);
	}
};
