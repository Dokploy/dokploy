import type { WriteStream } from "node:fs";
import type { ApplicationNested } from ".";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import { execAsync } from "../process/execAsync";

export const buildRailpack = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { env, appName } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.project.env,
	);

	try {
		// Ensure buildkit container is running, create if it doesn't exist
		await execAsync(
			"docker container inspect buildkit >/dev/null 2>&1 || docker run --rm --privileged -d --name buildkit moby/buildkit",
		);

		// Build the application using railpack
		const args = ["build", buildAppDirectory, "--name", appName];

		// Add environment variables
		for (const env of envVariables) {
			args.push("--env", env);
		}

		await spawnAsync(
			"railpack",
			args,
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
			{
				env: {
					...process.env,
					BUILDKIT_HOST: "docker-container://buildkit",
				},
			},
		);

		return true;
	} catch (e) {
		throw e;
	}
};

export const getRailpackCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const { env, appName } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.project.env,
	);

	// Build the application using railpack
	const args = ["build", buildAppDirectory, "--name", appName];

	// Add environment variables
	for (const env of envVariables) {
		args.push("--env", env);
	}

	const command = `railpack ${args.join(" ")}`;
	const bashCommand = `
	echo "Building with Railpack..." >> "${logPath}";
	docker container inspect buildkit >/dev/null 2>&1 || docker run --rm --privileged -d --name buildkit moby/buildkit;
	export BUILDKIT_HOST=docker-container://buildkit;
	${command} >> ${logPath} 2>> ${logPath} || { 
		echo "❌ Railpack build failed" >> ${logPath};
		exit 1;
	  }
	echo "✅ Railpack build completed." >> ${logPath};
	`;

	return bashCommand;
};
