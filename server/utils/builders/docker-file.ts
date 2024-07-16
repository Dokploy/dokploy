import type { WriteStream } from "node:fs";
import { docker } from "@/server/constants";
import * as tar from "tar-fs";
import type { ApplicationNested } from ".";
import { getBuildAppDirectory } from "../filesystem/directory";

export const buildCustomDocker = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { appName } = application;
	const dockerFilePath = getBuildAppDirectory(application);
	try {
		const image = `${appName}`;
		const contextPath =
			dockerFilePath.substring(0, dockerFilePath.lastIndexOf("/") + 1) || ".";
		const tarStream = tar.pack(contextPath);

		const stream = await docker.buildImage(tarStream, {
			t: image,
			dockerfile: dockerFilePath.substring(dockerFilePath.lastIndexOf("/") + 1),
			// TODO: maybe use or not forcerm
			// forcerm: true,
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
