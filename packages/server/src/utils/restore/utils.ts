import {
	getComposeContainerCommand,
	getServiceContainerCommand,
} from "../backups/utils";

export const normalizeRestoreInput = (value: string | null | undefined): string => {
	if (!value?.trim()) return '';

	// Allow only safe CLI characters: letters, numbers, dash, underscore, dot, colon, slash, equal, @
	const SAFE_CHARS_REGEX = /[^\w\-./:=@ ]/g;

	// Trim, remove unsafe characters, and normalize whitespace
	return value
		.trim()
		.replace(SAFE_CHARS_REGEX, '')  // remove unsafe chars
		.replace(/\s+/g, ' ');          // collapse multiple spaces into one
}

export const getPostgresRestoreCommand = (
	database: string,
	databaseUser: string,
	additionalOptions?: string[],
) => {
	const pgCmd = [
		'pg_restore',
		`-U '${normalizeRestoreInput(databaseUser)}'`,
		`-d ${normalizeRestoreInput(database)}`,
		'-O',
		'--clean',
		'--if-exists',
		...additionalOptions?.length ? additionalOptions.map(normalizeRestoreInput).filter(Boolean) : [],
	].join(' ');

	return `docker exec -i $CONTAINER_ID sh -c "${pgCmd}"`;
};

export const getMariadbRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
	additionalOptions?: string[],
) => {
	const mariaCmd = [
		'mariadb',
		`-u '${normalizeRestoreInput(databaseUser)}'`,
		`-p'${normalizeRestoreInput(databasePassword)}'`,
		...additionalOptions?.length ? additionalOptions.map(normalizeRestoreInput).filter(Boolean) : [],
		normalizeRestoreInput(database),
	].join(' ');

	return `docker exec -i $CONTAINER_ID sh -c "${mariaCmd}"`;
};

export const getMysqlRestoreCommand = (
	database: string,
	databasePassword: string,
	additionalOptions?: string[],
) => {
	const mysqlCmd = [
		'mysql',
		'-u root',
		`-p'${normalizeRestoreInput(databasePassword)}'`,
		...additionalOptions?.length ? additionalOptions.map(normalizeRestoreInput).filter(Boolean) : [],
		normalizeRestoreInput(database),
	].join(' ');

	return `docker exec -i $CONTAINER_ID sh -c "${mysqlCmd}"`;
};

export const getMongoRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
	additionalOptions?: string[],
) => {
	const mongoCmd = [
		'mongorestore',
		`--username '${normalizeRestoreInput(databaseUser)}'`,
		`--password '${normalizeRestoreInput(databasePassword)}'`,
		'--authenticationDatabase admin',
		`--db ${normalizeRestoreInput(database)}`,
		'--archive',
		...additionalOptions?.length ? additionalOptions.map(normalizeRestoreInput).filter(Boolean) : [],
	].join(' ');

	return `docker exec -i $CONTAINER_ID sh -c "${mongoCmd}"`;
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
	additionalOptions?: string[],
) => {
	const { database, databaseUser, databasePassword } = credentials;
	switch (type) {
		case "postgres":
			return getPostgresRestoreCommand(
				database,
				databaseUser || "",
				additionalOptions,
			);
		case "mariadb":
			return getMariadbRestoreCommand(
				database,
				databaseUser || "",
				databasePassword || "",
				additionalOptions,
			);
		case "mysql":
			return getMysqlRestoreCommand(
				database,
				databasePassword || "",
				additionalOptions,
			);
		case "mongo":
			return getMongoRestoreCommand(
				database,
				databaseUser || "",
				databasePassword || "",
				additionalOptions,
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
	additionalOptions?: string[];
}

export const getRestoreCommand = ({
	appName,
	type,
	restoreType,
	credentials,
	serviceName,
	rcloneCommand,
	backupFile,
	additionalOptions,
}: RestoreOptions) => {
	const containerSearch = getComposeSearchCommand(
		appName,
		restoreType,
		serviceName,
	);
	const restoreCommand = generateRestoreCommand(type, credentials, additionalOptions);
	let cmd = `CONTAINER_ID=$(${containerSearch})`;

	if (type !== "mongo") {
		cmd += ` && ${rcloneCommand} | ${restoreCommand}`;
	} else {
		cmd += ` && ${getMongoSpecificCommand(rcloneCommand, restoreCommand, backupFile || "")}`;
	}

	return cmd;
};
