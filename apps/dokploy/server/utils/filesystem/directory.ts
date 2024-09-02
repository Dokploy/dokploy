import fs, { promises as fsPromises } from "node:fs";
import path from "node:path";
import type { Application } from "@/server/api/services/application";
import {
	APPLICATIONS_PATH,
	COMPOSE_PATH,
	MONITORING_PATH,
} from "@/server/constants";
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

export const removeFileOrDirectory = async (path: string) => {
	try {
		await execAsync(`rm -rf ${path}`);
	} catch (error) {
		console.error(`Error to remove ${path}: ${error}`);
		throw error;
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

export const removeComposeDirectory = async (appName: string) => {
	const directoryPath = path.join(COMPOSE_PATH, appName);
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
	let buildPath = "";

	if (sourceType === "github") {
		buildPath = application?.buildPath || "";
	} else if (sourceType === "gitlab") {
		buildPath = application?.gitlabBuildPath || "";
	} else if (sourceType === "bitbucket") {
		buildPath = application?.bitbucketBuildPath || "";
	} else if (sourceType === "drop") {
		buildPath = application?.dropBuildPath || "";
	} else if (sourceType === "git") {
		buildPath = customGitBuildPath || "";
	}
	if (buildType === "dockerfile") {
		return path.join(
			APPLICATIONS_PATH,
			appName,
			"code",
			buildPath ?? "",
			dockerfile || "",
		);
	}

	return path.join(APPLICATIONS_PATH, appName, "code", buildPath ?? "");
};

export const getDockerContextPath = (application: Application) => {
	const { appName, dockerContextPath } = application;

	if (!dockerContextPath) {
		return null;
	}
	return path.join(APPLICATIONS_PATH, appName, "code", dockerContextPath);
};
