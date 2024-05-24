import { createWriteStream } from "node:fs";
import type { InferResultType } from "@/server/types/with";
import {
	calculateResources,
	generateBindMounts,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";

import { spawnAsync } from "../process/spawnAsync";

export type ComposeNested = InferResultType<"compose", { project: true }>;
export const buildCompose = async (compose: ComposeNested, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	// const { buildType, sourceType } = compose;
	try {
		writeStream.write("\nBuild Compose 🐳");

		const firstCommand = compose?.command?.split(" ")[0] as string;
		const restCommand = compose?.command?.split(" ").slice(1);

		writeStream.write(
			`\nCommand 👀: ${firstCommand} ${restCommand?.join(" ")}\n`,
		);

		await spawnAsync(firstCommand, restCommand, (data) => {
			if (writeStream.writable) {
				writeStream.write(data.toString());
			}
		});

		writeStream.write("Docker Compose Deployed: ✅");
	} catch (error) {
		writeStream.write(`ERROR: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};
