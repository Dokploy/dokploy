import { quote } from "shell-quote";
import {
	getComposeContainerCommand,
	getServiceContainerCommand,
} from "../backups/utils";

// User-controlled values are passed to the container via `docker exec -e` and
// read as "$VAR" inside a single-quoted inner script, so they never enter the
// inner command text. See the matching note in backups/utils.ts.
export const getPostgresRestoreCommand = (
	database: string,
	databaseUser: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_USER=${quote([databaseUser])} -i $CONTAINER_ID sh -c 'pg_restore -U "$DB_USER" -d "$DB_NAME" -O --clean --if-exists'`;
};

export const getMariadbRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_USER=${quote([databaseUser])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID sh -c 'mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME"'`;
};

export const getMysqlRestoreCommand = (
	database: string,
	databasePassword: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID sh -c 'mysql -u root -p"$DB_PASS" "$DB_NAME"'`;
};

export const getMongoRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_USER=${quote([databaseUser])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID sh -c 'mongorestore --username "$DB_USER" --password "$DB_PASS" --authenticationDatabase admin --db "$DB_NAME" --archive --drop'`;
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
): string => {
	const tempDir = "/tmp/dokploy-restore";
	const fileName = backupFile.split("/").pop() || "backup.sql.gz";
	const decompressedName = fileName.replace(".gz", "");
	return `
rm -rf ${tempDir} && \
mkdir -p ${tempDir} && \
${rcloneCommand} ${tempDir} && \
cd ${tempDir} && \
gunzip -f ${quote([fileName])} && \
${restoreCommand} < ${quote([decompressedName])} && \
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
