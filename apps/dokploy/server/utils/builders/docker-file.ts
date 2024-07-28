import type { WriteStream } from "node:fs";
import { prepareEnvironmentVariables } from "@dokploy/server/utils/docker/utils";
import type { ApplicationNested } from ".";
import { getBuildAppDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import { createEnvFile } from "./utils";

export const buildCustomDocker = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { appName, env, buildArgs } = application;
	const dockerFilePath = getBuildAppDirectory(application);
	try {
		const image = `${appName}`;

		const contextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";
		const args = prepareEnvironmentVariables(buildArgs);

		const commandArgs = ["build", "-t", image, "-f", dockerFilePath, "."];

		for (const arg of args) {
			commandArgs.push("--build-arg", arg);
		}

		createEnvFile(dockerFilePath, env);
		await spawnAsync(
			"docker",
			commandArgs,
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
			{
				cwd: contextPath,
			},
		);
	} catch (error) {
		throw error;
	}
};
