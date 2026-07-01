import path from "node:path";
import {
	normalizeRelativeFilePath,
	quoteShellArg,
} from "../filesystem/safe-path";

const SAFE_RESTORE_NAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;

export const normalizeRestoreBackupFile = (
	backupFile: string,
	allowedExtensions: string[],
) => {
	const objectPath = normalizeRelativeFilePath(backupFile);

	if (!allowedExtensions.some((extension) => objectPath.endsWith(extension))) {
		throw new Error("Invalid backup file extension");
	}

	return {
		fileName: path.posix.basename(objectPath),
		objectPath,
	};
};

export const normalizeRestoreDatabaseName = (databaseName: string) => {
	const normalizedDatabaseName = databaseName.trim();

	if (!SAFE_RESTORE_NAME_PATTERN.test(normalizedDatabaseName)) {
		throw new Error("Invalid database name");
	}

	return normalizedDatabaseName;
};

export const normalizeRestoreServiceName = (serviceName?: string) => {
	if (!serviceName) {
		return undefined;
	}

	const normalizedServiceName = serviceName.trim();

	if (!SAFE_RESTORE_NAME_PATTERN.test(normalizedServiceName)) {
		throw new Error("Invalid service name");
	}

	return normalizedServiceName;
};

export const quoteRestoreShellArg = (value: string) => quoteShellArg(value);
