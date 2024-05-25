import { createWriteStream } from "node:fs";
import type { InferResultType } from "@/server/types/with";
import { spawnAsync } from "../process/spawnAsync";
import { COMPOSE_PATH } from "@/server/constants";
import { join } from "node:path";

export type ComposeNested = InferResultType<"compose", { project: true }>;
export const buildCompose = async (compose: ComposeNested, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { sourceType } = compose;
	try {
		writeStream.write("\nBuild Compose 🐳");
		const command = sanitizeCommand(compose.command);

		writeStream.write(
			`\nCommand 👀: ${command.startCommand} ${command.restCommand?.join(
				" ",
			)}\n`,
		);
		writeStream.write(`\nSource Type: ${sourceType}: ✅\n`);

		writeStream.write(
			"\n=======================================================\n",
		);
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
