import { createWriteStream } from "node:fs";
import type { InferResultType } from "@/server/types/with";
import { spawnAsync } from "../process/spawnAsync";
import { COMPOSE_PATH } from "@/server/constants";
import { join } from "node:path";
import { generateFileMountsCompose } from "../docker/utils";
import boxen from "boxen";

export type ComposeNested = InferResultType<
	"compose",
	{ project: true; mounts: true }
>;
export const buildCompose = async (compose: ComposeNested, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { sourceType, appName, mounts, composeType } = compose;
	try {
		const command = createCommand(compose);
		generateFileMountsCompose(appName, mounts);

		const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: docker ${command}
Source Type: docker ${sourceType} ✅
Compose Type: ${composeType} ✅`;
		const logBox = boxen(logContent, {
			padding: {
				left: 1,
				right: 1,
				bottom: 1,
			},
			borderStyle: "double",
		});
		writeStream.write(`${logBox}\n`);

		const projectPath = join(COMPOSE_PATH, compose.appName);
		await spawnAsync(
			"docker",
			[...command.split(" ")],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data.toString());
				}
			},
			{
				cwd: projectPath,
			},
		);

		writeStream.write("Docker Compose Deployed: ✅");
	} catch (error) {
		writeStream.write(`ERROR: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};

// this will remove whitespaces, quotes
const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	const parts = sanitizedCommand.split(/\s+/);

	const restCommand = parts.map((arg) => arg.replace(/^"(.*)"$/, "$1"));

	return restCommand.join(" ");
};

const createCommand = (compose: ComposeNested) => {
	const { composeType, appName, sourceType } = compose;

	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	let command = "";

	if (composeType === "docker-compose") {
		command = `compose -p ${appName} -f ${path} up -d`;
	} else if (composeType === "stack") {
		command = `stack deploy -c ${path} ${appName} --prune`;
	}

	const customCommand = sanitizeCommand(compose.command);

	if (customCommand) {
		command = `${command} ${customCommand}`;
	}

	return command;
};
