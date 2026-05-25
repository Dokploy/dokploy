import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariablesForShell,
} from "@dokploy/server/utils/docker/utils";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "../filesystem/directory";
import { createSecretTempFile } from "../process/secrets";
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
		createEnvFile,
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

		const secrets = getEnvironmentVariablesObject(
			buildSecrets,
			application.environment.project.env,
			application.environment.env,
		);

		const secretEntries = Object.entries(secrets);
		const secretFiles = secretEntries.map(([key, value]) => ({
			key,
			secret: createSecretTempFile(
				"dokploy-build-secrets-",
				Buffer.from(key).toString("base64url"),
				value,
			),
		}));

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

		for (const { key, secret } of secretFiles) {
			commandArgs.push("--secret", `id=${key},src=${secret.path}`);
		}

		if (secretFiles.length > 0) {
			const cleanupCommand = secretFiles
				.map(({ secret }) => `rm -rf ${secret.quotedDir}`)
				.join(";");
			command += `trap "${cleanupCommand.replace(/"/g, '\\"')}" EXIT;`;
		}

		command += `
echo "Building ${appName}" ;
cd ${dockerContextPath} || {
  echo "❌ The path ${dockerContextPath} does not exist" ;
  exit 1;
}

docker ${commandArgs.join(" ")} || {
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
