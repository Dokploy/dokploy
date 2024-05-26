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
	const { sourceType, appName, mounts } = compose;
	try {
		const command = sanitizeCommand(compose.command);
		generateFileMountsCompose(appName, mounts);
		const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: ${command.startCommand} ${command.restCommand?.join(" ")}
Source Type: ${sourceType} ✅`;
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
			command.startCommand,
			command.restCommand,
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

	const startCommand = parts[0];

	const restCommand = parts
		.slice(1)
		.map((arg) => arg.replace(/^"(.*)"$/, "$1"));

	return {
		startCommand: startCommand || "NO COMMAND SET",
		restCommand,
	};
};
