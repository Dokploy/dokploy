import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Compose } from "@/server/api/services/compose";
import { COMPOSE_PATH } from "@/server/constants";
import { recreateDirectory } from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";

export const createComposeFile = async (compose: Compose, logPath: string) => {
	const { appName, composeFile } = compose;
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const outputPath = join(COMPOSE_PATH, appName, "code");

	try {
		await recreateDirectory(outputPath);
		writeStream.write(
			`\nCreating File 'docker-compose.yml' to ${outputPath}: ✅\n`,
		);

		await writeFile(join(outputPath, "docker-compose.yml"), composeFile);

		writeStream.write(`\nFile 'docker-compose.yml' created: ✅\n`);
	} catch (error) {
		writeStream.write(`\nERROR Creating Compose File: ${error}: ❌\n`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const getCreateComposeFileCommand = (compose: Compose) => {
	const { appName, composeFile } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");
	return `echo "${composeFile}" > ${filePath}`;
};

export const createComposeFileRaw = async (compose: Compose) => {
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
	const { appName, composeFile, serverId } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");

	try {
		const command = `
			mkdir -p ${outputPath};
			echo "${composeFile}" > ${filePath};
		`;
		await execAsyncRemote(serverId, command);
	} catch (error) {
		throw error;
	}
};
