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
	type BuildPlan,
	DEFAULT_MULTIARCH_BUILDER,
	planPlatformArgs,
} from "./build-platform";
import { createEnvFileCommand } from "./utils";

export const getDockerCommand = (
	application: ApplicationNested,
	plan: BuildPlan,
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
		const defaultContextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";

		const dockerContextPath =
			getDockerContextPath(application) || defaultContextPath;

		const useBuildx = plan.output.mode === "push" || plan.builder !== null;
		const builder =
			plan.builder ??
			(plan.output.mode === "push" ? DEFAULT_MULTIARCH_BUILDER : null);
		const commandArgs = useBuildx ? ["buildx", "build"] : ["build"];
		if (builder) {
			commandArgs.push("--builder", quote([builder]));
		}
		commandArgs.push(...planPlatformArgs(plan));

		if (plan.output.mode === "push") {
			for (const tag of plan.output.tags) {
				commandArgs.push("-t", quote([tag]));
			}
			commandArgs.push("--push");
		} else {
			commandArgs.push("-t", plan.output.image);
			if (useBuildx) {
				commandArgs.push("--load");
			}
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

		const createDefaultBuilder =
			plan.output.mode === "push" && !plan.builder
				? `docker buildx inspect ${quote([DEFAULT_MULTIARCH_BUILDER])} >/dev/null 2>&1 || docker buildx create --name ${quote([DEFAULT_MULTIARCH_BUILDER])} --driver docker-container --driver-opt network=host\n`
				: "";

		command += `
echo ${quote([`Building ${appName}`])} ;
cd ${quote([dockerContextPath])} || {
  echo ${quote([`❌ The path ${dockerContextPath} does not exist`])} ;
  exit 1;
}
${createDefaultBuilder}
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
