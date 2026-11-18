import path from "node:path";
import { getStaticCommand } from "@dokploy/server/utils/builders/static";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ContentStaging } from "../filesystem/write-content";
import type { ApplicationNested } from ".";
import { stageBuildArguments } from "./utils";

export const getNixpacksCommand = async (
	application: ApplicationNested,
	staging: ContentStaging,
) => {
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

	const prefix = await stageBuildArguments(
		staging,
		envVariables.flatMap((env) => ["--env", env]),
	);

	if (publishDirectory) {
		/* No need for any start command, since we'll use nginx later on */
		args.push("--no-error-without-start");
	}
	const command = `${prefix} nixpacks ${args.join(" ")}`;
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
	if (publishDirectory) {
		const localPath = path.join(buildAppDirectory, publishDirectory);
		const isDirectory =
			publishDirectory.endsWith("/") || !path.extname(publishDirectory);

		bashCommand += `
	docker create --name ${buildContainerId} ${appName}
	mkdir -p ${quote([localPath])}
	docker cp ${quote([`${buildContainerId}:/app/${publishDirectory}${isDirectory ? "/." : ""}`])} ${quote([localPath])} || {
		docker rm ${buildContainerId}
		echo ${quote([`❌ Copying ${publishDirectory} to ${localPath} failed`])} ;
		exit 1;
	}
	docker rm ${buildContainerId}
	${await getStaticCommand(application, staging)}
				`;
	}

	return bashCommand;
};
