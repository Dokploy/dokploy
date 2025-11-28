import {
	getEnviromentVariablesObject,
	prepareEnvironmentVariablesForShell,
} from "@dokploy/server/utils/docker/utils";
import { quote } from "shell-quote";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "../filesystem/directory";
import type { ApplicationNested } from ".";
import { createEnvFileCommand } from "./utils";

export const getDockerCommand = (application: ApplicationNested) => {
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

		const args = prepareEnvironmentVariablesForShell(
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

		const joinedSecrets = Object.entries(secrets)
			.map(([key, value]) => `${key}=${quote([value])}`)
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
echo "Building ${appName}" ;
cd ${dockerContextPath} || { 
  echo "❌ The path ${dockerContextPath} does not exist" ;
  exit 1;
}

${joinedSecrets} docker ${commandArgs.join(" ")} || { 
  echo "❌ Docker build failed" ;
  exit 1;
}
echo "✅ Docker build completed." ;
		`;

		return command;
	} catch (error) {
		throw error;
	}
};
