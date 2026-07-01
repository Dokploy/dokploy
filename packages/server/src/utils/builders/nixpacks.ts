import path from "node:path";
import { getStaticCommand } from "@dokploy/server/utils/builders/static";
import { nanoid } from "nanoid";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import {
	getNoSymlinkFilePathGuardCommand,
	normalizeRelativeFilePath,
	quoteShellArg,
} from "../filesystem/safe-path";
import { quoteShellArgs } from "../shell";
import type { ApplicationNested } from ".";

export const getNixpacksCommand = (application: ApplicationNested) => {
	const { env, appName, publishDirectory, cleanCache } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const buildContainerId = `${appName}-${nanoid(10)}`;
	const envVariables = prepareEnvironmentVariables(
		env,
		application.environment.project.env,
		application.environment.env,
	);

	const args = ["build", buildAppDirectory, "--name", appName];

	if (cleanCache) {
		args.push("--no-cache");
	}

	for (const env of envVariables) {
		args.push("--env", env);
	}

	const safePublishDirectory = publishDirectory
		? normalizeRelativeFilePath(publishDirectory)
		: "";

	if (safePublishDirectory) {
		/* No need for any start command, since we'll use nginx later on */
		args.push("--no-error-without-start");
	}
	const command = quoteShellArgs(["nixpacks", ...args]);
	let bashCommand = `
		echo "Starting nixpacks build..." ;
		${command} || {
			echo "❌ Nixpacks build failed" ;
			exit 1;
		}
		echo "✅ Nixpacks build completed." ;
		`;

	/*
		Run the container with the image created by nixpacks,
		and copy the artifacts on the host filesystem.
		Then, remove the container and create a static build.
	 */
	if (safePublishDirectory) {
		const localPath = path.join(buildAppDirectory, safePublishDirectory);
		const pathGuardCommand = getNoSymlinkFilePathGuardCommand(
			buildAppDirectory,
			localPath,
		);
		const isDirectory =
			safePublishDirectory.endsWith("/") || !path.extname(safePublishDirectory);
		const containerSource = `${buildContainerId}:/app/${safePublishDirectory}${isDirectory ? "/." : ""}`;

		bashCommand += `
		${quoteShellArgs(["docker", "create", "--name", buildContainerId, appName])}
		${pathGuardCommand}
		mkdir -p ${quoteShellArg(localPath)}
	${quoteShellArgs(["docker", "cp", containerSource, path.join(buildAppDirectory, safePublishDirectory)])} || {
		${quoteShellArgs(["docker", "rm", buildContainerId])}
		echo ${quoteShellArg(`❌ Copying ${safePublishDirectory} to ${path.join(buildAppDirectory, safePublishDirectory)} failed`)} ;
		exit 1;
	}
	${quoteShellArgs(["docker", "rm", buildContainerId])}
	${getStaticCommand({ ...application, publishDirectory: safePublishDirectory })}
				`;
	}

	return bashCommand;
};
