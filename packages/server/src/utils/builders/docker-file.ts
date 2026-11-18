import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
} from "@dokploy/server/utils/docker/utils";
import { quote } from "shell-quote";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "../filesystem/directory";
import type { ContentStaging } from "../filesystem/write-content";
import type { ApplicationNested } from ".";
import { createEnvFileCommand, stageBuildArguments } from "./utils";

export const getDockerCommand = async (
	application: ApplicationNested,
	staging: ContentStaging,
) => {
	const {
		appName,
		env,
		publishDirectory,
		buildArgs,
		buildSecrets,
		dockerBuildStage,
		cleanCache,
		createEnvFile,
	} = application;
	const dockerFilePath = getBuildAppDirectory(application);

	try {
		const image = `${appName}`;

		const defaultContextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";

		const dockerContextPath =
			getDockerContextPath(application) || defaultContextPath;

		const commandArgs = [
			"build",
			"-t",
			image,
			"-f",
			dockerFilePath,
			dockerContextPath,
		];

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

		const stagedArgs = args.flatMap((arg) => ["--build-arg", arg]);

		const secrets = getEnvironmentVariablesObject(
			buildSecrets,
			application.environment.project.env,
			application.environment.env,
		);

		/*
			Do not generate an environment file when publishDirectory is specified,
			as it could be publicly exposed.
			Also respect the createEnvFile flag.
		*/
		let command = "";
		if (!publishDirectory && createEnvFile) {
			command += await createEnvFileCommand(
				dockerFilePath,
				env,
				staging,
				application.environment.project.env,
				application.environment.env,
			);
		}

		for (const key in secrets) {
			// Although buildx is smart enough to know we may be referring to an environment variable name,
			// we still make sure it doesn't fall back to `type=file`.
			// See: https://docs.docker.com/reference/cli/docker/buildx/build/#secret
			stagedArgs.push("--secret", `type=env,id=${key}`);
		}
		const prefix = await stageBuildArguments(staging, stagedArgs, secrets);

		command += `
echo ${quote([`Building ${appName}`])} ;
cd ${quote([dockerContextPath])} || {
  echo ${quote([`❌ The path ${dockerContextPath} does not exist`])} ;
  exit 1;
}

${prefix} docker ${commandArgs.join(" ")} || {
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
