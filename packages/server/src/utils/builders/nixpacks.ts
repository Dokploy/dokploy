import { existsSync, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import {
	buildStatic,
	getStaticCommand,
} from "@dokploy/server/utils/builders/static";
import { nanoid } from "nanoid";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { ApplicationNested } from ".";

export const buildNixpacks = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { env, appName, publishDirectory, cleanCache } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const buildContainerId = `${appName}-${nanoid(10)}`;
	const envVariables = prepareEnvironmentVariables(
		env,
		application.project.env,
	);

	const writeToStream = (data: string) => {
		if (writeStream.writable) {
			writeStream.write(data);
		}
	};

	try {
		const args = ["build", buildAppDirectory, "--name", appName];

		if (cleanCache) {
			args.push("--no-cache");
		}

		for (const env of envVariables) {
			args.push("--env", env);
		}

		if (publishDirectory) {
			/* No need for any start command, since we'll use nginx later on */
			args.push("--no-error-without-start");
		}

		await spawnAsync("nixpacks", args, writeToStream);

		/*
			Run the container with the image created by nixpacks,
			and copy the artifacts on the host filesystem.
			Then, remove the container and create a static build.
		*/
		if (publishDirectory) {
			await spawnAsync(
				"docker",
				["create", "--name", buildContainerId, appName],
				writeToStream,
			);

			const localPath = path.join(buildAppDirectory, publishDirectory);

			if (!existsSync(path.dirname(localPath))) {
				mkdirSync(path.dirname(localPath), { recursive: true });
			}

			// https://docs.docker.com/reference/cli/docker/container/cp/
			const isDirectory =
				publishDirectory.endsWith("/") || !path.extname(publishDirectory);

			await spawnAsync(
				"docker",
				[
					"cp",
					`${buildContainerId}:/app/${publishDirectory}${isDirectory ? "/." : ""}`,
					localPath,
				],
				writeToStream,
			);

			await spawnAsync("docker", ["rm", buildContainerId], writeToStream);

			await buildStatic(application, writeStream);
		}
		return true;
	} catch (e) {
		await spawnAsync("docker", ["rm", buildContainerId], writeToStream);

		throw e;
	}
};

export const getNixpacksCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const { env, appName, publishDirectory, cleanCache } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const buildContainerId = `${appName}-${nanoid(10)}`;
	const envVariables = prepareEnvironmentVariables(
		env,
		application.project.env,
	);

	const args = ["build", buildAppDirectory, "--name", appName];

	if (cleanCache) {
		args.push("--no-cache");
	}

	for (const env of envVariables) {
		args.push("--env", `'${env}'`);
	}

	if (publishDirectory) {
		/* No need for any start command, since we'll use nginx later on */
		args.push("--no-error-without-start");
	}
	const command = `nixpacks ${args.join(" ")}`;
	let bashCommand = `
echo "Starting nixpacks build..." >> ${logPath};
${command} >> ${logPath} 2>> ${logPath} || { 
  echo "❌ Nixpacks build failed" >> ${logPath};
  exit 1;
}
echo "✅ Nixpacks build completed." >> ${logPath};
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
mkdir -p ${localPath}
docker cp ${buildContainerId}:/app/${publishDirectory}${isDirectory ? "/." : ""} ${path.join(buildAppDirectory, publishDirectory)} >> ${logPath} 2>> ${logPath} || { 
	docker rm ${buildContainerId}
	echo "❌ Copying ${publishDirectory} to ${path.join(buildAppDirectory, publishDirectory)} failed" >> ${logPath};
	exit 1;
}
docker rm ${buildContainerId}
${getStaticCommand(application, logPath)}
			`;
	}

	return bashCommand;
};
