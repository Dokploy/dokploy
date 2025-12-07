import {
	type EncryptionConfig,
	getComposeContainerCommand,
	getDecryptionCommand,
	getServiceContainerCommand,
} from "../backups/utils";

export const isEncryptedBackup = (backupFile: string): boolean => {
	return backupFile.endsWith(".enc");
};

export const getPostgresRestoreCommand = (
	database: string,
	databaseUser: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "pg_restore -U '${databaseUser}' -d ${database} -O --clean --if-exists"`;
};

export const getMariadbRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "mariadb -u '${databaseUser}' -p'${databasePassword}' ${database}"`;
};

export const getMysqlRestoreCommand = (
	database: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "mysql -u root -p'${databasePassword}' ${database}"`;
};

export const getMongoRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "mongorestore --username '${databaseUser}' --password '${databasePassword}' --authenticationDatabase admin --db ${database} --archive"`;
};

export const getComposeSearchCommand = (
	appName: string,
	type: "stack" | "docker-compose" | "database",
	serviceName?: string,
) => {
	if (type === "database") {
		return getServiceContainerCommand(appName || "");
	}
	return getComposeContainerCommand(appName || "", serviceName || "", type);
};

interface DatabaseCredentials {
	database: string;
	databaseUser?: string;
	databasePassword?: string;
}

const generateRestoreCommand = (
	type: "postgres" | "mariadb" | "mysql" | "mongo",
	credentials: DatabaseCredentials,
) => {
	const { database, databaseUser, databasePassword } = credentials;
	switch (type) {
		case "postgres":
			return getPostgresRestoreCommand(database, databaseUser || "");
		case "mariadb":
			return getMariadbRestoreCommand(
				database,
				databaseUser || "",
				databasePassword || "",
			);
		case "mysql":
			return getMysqlRestoreCommand(database, databasePassword || "");
		case "mongo":
			return getMongoRestoreCommand(
				database,
				databaseUser || "",
				databasePassword || "",
			);
	}
};

const getMongoSpecificCommand = (
	rcloneCommand: string,
	restoreCommand: string,
	backupFile: string,
	encryptionConfig?: EncryptionConfig,
): string => {
	const tempDir = "/tmp/dokploy-restore";
	const fileName = backupFile.split("/").pop() || "backup.sql.gz";
	const isEncrypted = isEncryptedBackup(backupFile);
	const decryptionCommand = encryptionConfig
		? getDecryptionCommand(encryptionConfig)
		: "";

	if (isEncrypted && decryptionCommand) {
		// For encrypted mongo backups: download -> decrypt -> decompress -> restore
		const decryptedName = fileName.replace(".enc", "");
		const decompressedName = decryptedName.replace(".gz", "");
		return `
rm -rf ${tempDir} && \
mkdir -p ${tempDir} && \
${rcloneCommand} ${tempDir} && \
cd ${tempDir} && \
cat "${fileName}" | ${decryptionCommand} > "${decryptedName}" && \
gunzip -f "${decryptedName}" && \
${restoreCommand} < "${decompressedName}" && \
rm -rf ${tempDir}
		`;
	}

	// Original non-encrypted flow
	const decompressedName = fileName.replace(".gz", "");
	return `
rm -rf ${tempDir} && \
mkdir -p ${tempDir} && \
${rcloneCommand} ${tempDir} && \
cd ${tempDir} && \
gunzip -f "${fileName}" && \
${restoreCommand} < "${decompressedName}" && \
rm -rf ${tempDir}
	`;
};

interface RestoreOptions {
	appName: string;
	type: "postgres" | "mariadb" | "mysql" | "mongo";
	restoreType: "stack" | "docker-compose" | "database";
	credentials: DatabaseCredentials;
	serviceName?: string;
	rcloneCommand: string;
	backupFile?: string;
	encryptionConfig?: EncryptionConfig;
}

export const getRestoreCommand = ({
	appName,
	type,
	restoreType,
	credentials,
	serviceName,
	rcloneCommand,
	backupFile,
	encryptionConfig,
}: RestoreOptions) => {
	const containerSearch = getComposeSearchCommand(
		appName,
		restoreType,
		serviceName,
	);
	const restoreCommand = generateRestoreCommand(type, credentials);
	let cmd = `CONTAINER_ID=$(${containerSearch})`;

	// Detect if backup is encrypted based on file extension
	const isEncrypted = backupFile ? isEncryptedBackup(backupFile) : false;
	const decryptionCommand =
		isEncrypted && encryptionConfig
			? getDecryptionCommand(encryptionConfig)
			: "";

	if (type !== "mongo") {
		// For non-mongo databases: rclone cat | [decrypt | gunzip |] restore
		// Note: for encrypted backups, rcloneCommand doesn't include gunzip,
		// so we need to add it after decryption
		if (isEncrypted && decryptionCommand) {
			cmd += ` && ${rcloneCommand} | ${decryptionCommand} | gunzip | ${restoreCommand}`;
		} else {
			cmd += ` && ${rcloneCommand} | ${restoreCommand}`;
		}
	} else {
		cmd += ` && ${getMongoSpecificCommand(rcloneCommand, restoreCommand, backupFile || "", encryptionConfig)}`;
	}

	return cmd;
};
