import type { WriteStream } from "node:fs";
import { prepareEnvironmentVariables } from "@/server/utils/docker/utils";
import type { ApplicationNested } from ".";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import { createEnvFile } from "./utils";

export const buildCustomDocker = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { appName, env, publishDirectory, buildArgs, dockerBuildStage } = application;
	const dockerFilePath = getBuildAppDirectory(application);
	try {
		const image = `${appName}`;

		const defaultContextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";
		const args = prepareEnvironmentVariables(buildArgs);

		const dockerContextPath = getDockerContextPath(application);

		const commandArgs = ["build", "-t", image, "-f", dockerFilePath, "."];

		if (!!dockerBuildStage) {
			commandArgs.push("--target", dockerBuildStage);
		}

		for (const arg of args) {
			commandArgs.push("--build-arg", arg);
		}
		/*
			Do not generate an environment file when publishDirectory is specified,
			as it could be publicly exposed.
		*/
		if (!publishDirectory) {
			createEnvFile(dockerFilePath, env);
		}

		await spawnAsync(
			"docker",
			commandArgs,
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
			{
				cwd: dockerContextPath || defaultContextPath,
			},
		);
	} catch (error) {
		throw error;
	}
};
