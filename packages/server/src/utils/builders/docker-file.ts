import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariablesForShell,
} from "@dokploy/server/utils/docker/utils";
import { quote } from "shell-quote";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "../filesystem/directory";
import type { ApplicationNested } from ".";
import {
	dockerfileBuildxBuilder,
	ensureMultiarchBuilderCommand,
	planBuildArchitecture,
	planPlatformArgs,
	usesBuildx,
} from "./build-platform";
import { createEnvFileCommand } from "./utils";

export type DockerBuildOptions = {
	pushTags?: string[];
};

export const getDockerCommand = (
	application: ApplicationNested,
	options: DockerBuildOptions = {},
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
	const plan = planBuildArchitecture(application);

	try {
		const image = `${appName}`;

		const defaultContextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";

		const dockerContextPath =
			getDockerContextPath(application) || defaultContextPath;

		if (
			plan.kind === "multi" &&
			(!options.pushTags || options.pushTags.length === 0)
		) {
			throw new Error(
				"Multi-architecture builds require registry tags to push.",
			);
		}

		const commandArgs = usesBuildx(plan) ? ["buildx", "build"] : ["build"];
		const builder = dockerfileBuildxBuilder(plan);
		if (builder) {
			commandArgs.push("--builder", quote([builder]));
		}
		commandArgs.push(...planPlatformArgs(plan));

		if (plan.kind === "multi") {
			for (const tag of options.pushTags ?? []) {
				commandArgs.push("-t", quote([tag]));
			}
			commandArgs.push("--push");
		} else {
			commandArgs.push("-t", image);
		}

		commandArgs.push("-f", dockerFilePath, dockerContextPath);

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

		const secrets = getEnvironmentVariablesObject(
			buildSecrets,
			application.environment.project.env,
			application.environment.env,
		);

		const joinedSecrets = Object.entries(secrets)
			.map(([key, value]) => `${key}=${quote([value])}`)
			.join(" ");

		/*
			Do not generate an environment file when publishDirectory is specified,
			as it could be publicly exposed.
			Also respect the createEnvFile flag.
		*/
		let command = "";
		if (!publishDirectory && createEnvFile) {
			command += createEnvFileCommand(
				dockerFilePath,
				env,
				application.environment.project.env,
				application.environment.env,
			);
		}

		for (const key in secrets) {
			// Although buildx is smart enough to know we may be referring to an environment variable name,
			// we still make sure it doesn't fall back to `type=file`.
			// See: https://docs.docker.com/reference/cli/docker/buildx/build/#secret
			commandArgs.push("--secret", `type=env,id=${key}`);
		}

		command += `
echo ${quote([`Building ${appName}`])} ;
cd ${quote([dockerContextPath])} || {
  echo ${quote([`❌ The path ${dockerContextPath} does not exist`])} ;
  exit 1;
}
${ensureMultiarchBuilderCommand(plan)}
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
