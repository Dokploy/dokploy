import {
	getComposeContainerCommand,
	getServiceContainerCommand,
} from "../backups/utils";
import {
	normalizeRestoreBackupFile,
	normalizeRestoreDatabaseName,
	normalizeRestoreServiceName,
	quoteRestoreShellArg,
} from "./safe-input";

const getDockerExecShellCommand = (command: string) => {
	return `docker exec -i $CONTAINER_ID sh -c ${quoteRestoreShellArg(command)}`;
};

export const getPostgresRestoreCommand = (
	database: string,
	databaseUser: string,
) => {
	return getDockerExecShellCommand(
		`pg_restore -U ${quoteRestoreShellArg(databaseUser)} -d ${quoteRestoreShellArg(database)} -O --clean --if-exists`,
	);
};

export const getMariadbRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return getDockerExecShellCommand(
		`mariadb -u ${quoteRestoreShellArg(databaseUser)} -p${quoteRestoreShellArg(databasePassword)} ${quoteRestoreShellArg(database)}`,
	);
};

export const getMysqlRestoreCommand = (
	database: string,
	databasePassword: string,
) => {
	return getDockerExecShellCommand(
		`mysql -u root -p${quoteRestoreShellArg(databasePassword)} ${quoteRestoreShellArg(database)}`,
	);
};

export const getMongoRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return getDockerExecShellCommand(
		`mongorestore --username ${quoteRestoreShellArg(databaseUser)} --password ${quoteRestoreShellArg(databasePassword)} --authenticationDatabase admin --db ${quoteRestoreShellArg(database)} --archive --drop`,
	);
};

export const getComposeSearchCommand = (
	appName: string,
	type: "stack" | "docker-compose" | "database",
	serviceName?: string,
) => {
	if (type === "database") {
		return getServiceContainerCommand(appName || "");
	}
	return getComposeContainerCommand(
		appName || "",
		normalizeRestoreServiceName(serviceName) || "",
		type,
	);
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
	const normalizedDatabase = normalizeRestoreDatabaseName(database);
	switch (type) {
		case "postgres":
			return getPostgresRestoreCommand(normalizedDatabase, databaseUser || "");
		case "mariadb":
			return getMariadbRestoreCommand(
				normalizedDatabase,
				databaseUser || "",
				databasePassword || "",
			);
		case "mysql":
			return getMysqlRestoreCommand(normalizedDatabase, databasePassword || "");
		case "mongo":
			return getMongoRestoreCommand(
				normalizedDatabase,
				databaseUser || "",
				databasePassword || "",
			);
	}
};

const getMongoSpecificCommand = (
	rcloneCommand: string,
	restoreCommand: string,
	backupFile: string,
): string => {
	const tempDir = quoteRestoreShellArg("/tmp/dokploy-restore");
	const { fileName } = normalizeRestoreBackupFile(backupFile, [".bson.gz"]);
	const quotedFileName = quoteRestoreShellArg(fileName);
	const decompressedName = fileName.replace(".gz", "");
	const quotedDecompressedName = quoteRestoreShellArg(decompressedName);
	return `
rm -rf ${tempDir} && \
mkdir -p ${tempDir} && \
${rcloneCommand} ${tempDir} && \
cd ${tempDir} && \
gunzip -f ${quotedFileName} && \
${restoreCommand} < ${quotedDecompressedName} && \
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
}

export const getRestoreCommand = ({
	appName,
	type,
	restoreType,
	credentials,
	serviceName,
	rcloneCommand,
	backupFile,
}: RestoreOptions) => {
	const containerSearch = getComposeSearchCommand(
		appName,
		restoreType,
		serviceName,
	);
	const restoreCommand = generateRestoreCommand(type, credentials);
	let cmd = `CONTAINER_ID=$(${containerSearch})`;

	if (type !== "mongo") {
		cmd += ` && ${rcloneCommand} | ${restoreCommand}`;
	} else {
		cmd += ` && ${getMongoSpecificCommand(rcloneCommand, restoreCommand, backupFile || "")}`;
	}

	return cmd;
};
