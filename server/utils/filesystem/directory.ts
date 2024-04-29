import fs, { promises as fsPromises } from "node:fs";
import path from "node:path";
import type { Application } from "@/server/api/services/application";
import { APPLICATIONS_PATH, MONITORING_PATH } from "@/server/constants";
import { execAsync } from "../process/execAsync";

export const recreateDirectory = async (pathFolder: string): Promise<void> => {
	try {
		await removeDirectoryIfExistsContent(pathFolder);
		await fsPromises.mkdir(pathFolder, { recursive: true });
	} catch (error) {
		console.error(`Error recreating directory '${pathFolder}':`, error);
	}
};

export const removeDirectoryIfExistsContent = async (
	path: string,
): Promise<void> => {
	if (fs.existsSync(path) && fs.readdirSync(path).length !== 0) {
		await execAsync(`rm -rf ${path}`);
	}
};

export const removeDirectoryCode = async (appName: string) => {
	const directoryPath = path.join(APPLICATIONS_PATH, appName);

	try {
		await execAsync(`rm -rf ${directoryPath}`);
	} catch (error) {
		console.error(`Error to remove ${directoryPath}: ${error}`);
		throw error;
	}
};

export const removeMonitoringDirectory = async (appName: string) => {
	const directoryPath = path.join(MONITORING_PATH, appName);
	try {
		await execAsync(`rm -rf ${directoryPath}`);
	} catch (error) {
		console.error(`Error to remove ${directoryPath}: ${error}`);
		throw error;
	}
};

export const getBuildAppDirectory = (application: Application) => {
	const { appName, buildType, sourceType, customGitBuildPath, dockerfile } =
		application;
	const buildPath =
		sourceType === "github" ? application?.buildPath : customGitBuildPath;
	if (buildType === "dockerfile") {
		return path.join(
			APPLICATIONS_PATH,
			appName,
			buildPath ?? "",
			dockerfile || "",
		);
	}
	return path.join(APPLICATIONS_PATH, appName, buildPath ?? "");
};
