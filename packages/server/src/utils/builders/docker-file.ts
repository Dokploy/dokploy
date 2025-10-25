import type { WriteStream } from "node:fs";
import {
	getEnviromentVariablesObject,
	prepareEnvironmentVariables,
} from "@dokploy/server/utils/docker/utils";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { ApplicationNested } from ".";
import { createEnvFile, createEnvFileCommand } from "./utils";

export const buildCustomDocker = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const {
		appName,
		env,
		publishDirectory,
		buildArgs,
		buildSecrets,
		dockerBuildStage,
		cleanCache,
	} = application;
	const dockerFilePath = getBuildAppDirectory(application);
	try {
		const image = `${appName}`;

		const defaultContextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";

		const dockerContextPath = getDockerContextPath(application);

		const commandArgs = ["build", "-t", image, "-f", dockerFilePath, "."];

		if (cleanCache) {
			commandArgs.push("--no-cache");
		}

		if (dockerBuildStage) {
			commandArgs.push("--target", dockerBuildStage);
		}

		const args = prepareEnvironmentVariables(
			buildArgs,
			application.environment.project.env,
			application.environment.env,
		);

		for (const arg of args) {
			commandArgs.push("--build-arg", arg);
		}

		const secrets = getEnviromentVariablesObject(
			buildSecrets,
			application.environment.project.env,
			application.environment.env,
		);

		for (const key in secrets) {
			// Although buildx is smart enough to know we may be referring to an environment variable name,
			// we still make sure it doesn't fall back to type=file.
			// See: https://docs.docker.com/reference/cli/docker/buildx/build/#secret
			commandArgs.push("--secret", `type=env,id=${key}`);
		}

		/*
			Do not generate an environment file when publishDirectory is specified,
			as it could be publicly exposed.
		*/
		if (!publishDirectory) {
			createEnvFile(
				dockerFilePath,
				env,
				application.environment.project.env,
				application.environment.env,
			);
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
				env: {
					...process.env,
					...secrets,
				},
			},
		);
	} catch (error) {
		throw error;
	}
};

export const getDockerCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const {
		appName,
		env,
		publishDirectory,
		buildArgs,
		buildSecrets,
		dockerBuildStage,
		cleanCache,
	} = application;
	const dockerFilePath = getBuildAppDirectory(application);

	try {
		const image = `${appName}`;

		const defaultContextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";

		const dockerContextPath =
			getDockerContextPath(application) || defaultContextPath;

		const commandArgs = ["build", "-t", image, "-f", dockerFilePath, "."];

		if (dockerBuildStage) {
			commandArgs.push("--target", dockerBuildStage);
		}

		if (cleanCache) {
			commandArgs.push("--no-cache");
		}

		const args = prepareEnvironmentVariables(
			buildArgs,
			application.environment.project.env,
			application.environment.env,
		);

		for (const arg of args) {
			commandArgs.push("--build-arg", `'${arg}'`);
		}

		const secrets = getEnviromentVariablesObject(
			buildSecrets,
			application.environment.project.env,
			application.environment.env,
		);

		const joinedSecrets = Object.entries(secrets)
			.map(([key, value]) => `${key}='${value.replace(/'/g, "'\"'\"'")}'`)
			.join(" ");

		for (const key in secrets) {
			// Although buildx is smart enough to know we may be referring to an environment variable name,
			// we still make sure it doesn't fall back to `type=file`.
			// See: https://docs.docker.com/reference/cli/docker/buildx/build/#secret
			commandArgs.push("--secret", `type=env,id=${key}`);
		}

		/*
			Do not generate an environment file when publishDirectory is specified,
			as it could be publicly exposed.
		*/
		let command = "";
		if (!publishDirectory) {
			command += createEnvFileCommand(
				dockerFilePath,
				env,
				application.environment.project.env,
				application.environment.env,
			);
		}

		command += `
echo "Building ${appName}" >> ${logPath};
cd ${dockerContextPath} >> ${logPath} 2>> ${logPath} || { 
  echo "❌ The path ${dockerContextPath} does not exist" >> ${logPath};
  exit 1;
}

${joinedSecrets} docker ${commandArgs.join(" ")} >> ${logPath} 2>> ${logPath} || { 
  echo "❌ Docker build failed" >> ${logPath};
  exit 1;
}
echo "✅ Docker build completed." >> ${logPath};
		`;

		return command;
	} catch (error) {
		throw error;
	}
};
