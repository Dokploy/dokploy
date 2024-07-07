import type { ApplicationNested } from ".";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { WriteStream } from "node:fs";

// TODO: integrate in the vps sudo chown -R $(whoami) ~/.docker
export const buildNixpacks = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { env, appName } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariables(env);
	try {
		const args = ["build", buildAppDirectory, "--name", appName];

		for (const env of envVariables) {
			args.push("--env", env);
		}

		await spawnAsync("nixpacks", args, (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});
		return true;
	} catch (e) {
		throw e;
	}
};
