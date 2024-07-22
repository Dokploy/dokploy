import type { WriteStream } from "node:fs";
import { docker } from "@/server/constants";
import { prepareBuildArgs } from "@/server/utils/docker/utils";
import * as tar from "tar-fs";
import type { ApplicationNested } from ".";
import { getBuildAppDirectory } from "../filesystem/directory";
import { createEnvFile } from "./utils";

export const buildCustomDocker = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { appName, env, buildArgs } = application;
	const dockerFilePath = getBuildAppDirectory(application);
	try {
		const image = `${appName}`;
		const contextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";
		const tarStream = tar.pack(contextPath);

		createEnvFile(dockerFilePath, env);

		const stream = await docker.buildImage(tarStream, {
			t: image,
			buildargs: prepareBuildArgs(buildArgs),
			dockerfile: dockerFilePath.substring(dockerFilePath.lastIndexOf("/") + 1),
		});

		await new Promise((resolve, reject) => {
			docker.modem.followProgress(
				stream,
				(err, res) => (err ? reject(err) : resolve(res)),
				(event) => {
					if (event.stream) {
						writeStream.write(event.stream);
					}
				},
			);
		});
	} catch (error) {
		throw error;
	}
};
