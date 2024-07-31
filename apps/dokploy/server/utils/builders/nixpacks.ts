import type { WriteStream } from "node:fs";
import path from "node:path";
import { buildStatic } from "@/server/utils/builders/static";
import type { ApplicationNested } from ".";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";

// TODO: integrate in the vps sudo chown -R $(whoami) ~/.docker
export const buildNixpacks = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { env, appName, publishDirectory } = application;
	const buildAppDirectory = getBuildAppDirectory(application);

	const envVariables = prepareEnvironmentVariables(env);
	try {
		const args = ["build", buildAppDirectory, "--name", appName];

		for (const env of envVariables) {
			args.push("--env", env);
		}

		if (publishDirectory) {
			/* No need for any start command, since we'll use nginx later on */
			args.push("--no-error-without-start");
		}

		await spawnAsync("nixpacks", args, (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});

		/*
			Run the container with the image created by nixpacks,
			and copy the artifacts on the host filesystem.
			Then, remove the container and create a static build.
		*/

		if (publishDirectory) {
			await spawnAsync(
				"docker",
				["create", "--name", `${appName}-temp`, appName],
				(data) => {
					if (writeStream.writable) {
						writeStream.write(data);
					}
				},
			);

			await spawnAsync(
				"docker",
				[
					"cp",
					`${appName}-temp:/app/${publishDirectory}`,
					path.join(buildAppDirectory, publishDirectory),
				],
				(data) => {
					if (writeStream.writable) {
						writeStream.write(data);
					}
				},
			);

			await spawnAsync("docker", ["rm", `${appName}-temp`], (data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			});

			await buildStatic(application, writeStream);
		}
		return true;
	} catch (e) {
		throw e;
	}
};
