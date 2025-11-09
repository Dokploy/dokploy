import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import { encodeBase64 } from "../docker/utils";
import { recreateDirectory } from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";

export const getCreateComposeFileCommand = (compose: Compose) => {
	const { COMPOSE_PATH } = paths(true);
	const { appName, composeFile } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");
	const encodedContent = encodeBase64(composeFile);
	const bashCommand = `
		rm -rf ${outputPath};
		mkdir -p ${outputPath};
		echo "${encodedContent}" | base64 -d > "${filePath}";
		echo "File 'docker-compose.yml' created: ✅";
	`;
	return bashCommand;
};

export const createComposeFileRaw = async (compose: Compose) => {
	const { COMPOSE_PATH } = paths();
	const { appName, composeFile } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");
	try {
		await recreateDirectory(outputPath);
		await writeFile(filePath, composeFile);
	} catch (error) {
		throw error;
	}
};

export const createComposeFileRawRemote = async (compose: Compose) => {
	const { COMPOSE_PATH } = paths(true);
	const { appName, composeFile, serverId } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");

	try {
		const encodedContent = encodeBase64(composeFile);
		const command = `
			rm -rf ${outputPath};
			mkdir -p ${outputPath};
			echo "${encodedContent}" | base64 -d > "${filePath}";
		`;
		await execAsyncRemote(serverId, command);
	} catch (error) {
		throw error;
	}
};
