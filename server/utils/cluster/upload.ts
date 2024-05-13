import type { ApplicationNested } from "../builders";
import { execAsync } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";
import type { WriteStream } from "node:fs";

export const uploadImage = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const registry = application.registry;

	if (!registry) {
		throw new Error("Registry not found");
	}

	const { registryUrl, imagePrefix } = registry;
	const { appName } = application;
	const imageName = `${appName}:latest`;

	let finalURL = registryUrl;

	let registryTag = `${registryUrl}/${imageName}`;

	if (imagePrefix) {
		registryTag = `${registryUrl}/${imagePrefix}/${imageName}`;
	}

	//  registry.digitalocean.com/<my-registry>/<my-image>
	//  index.docker.io/siumauricio/app-parse-multi-byte-port-e32uh7:latest
	if (registry.registryType === "selfHosted") {
		finalURL =
			process.env.NODE_ENV === "development" ? "localhost:5000" : registryUrl;
		registryTag = `${finalURL}/${imageName}`;
	}

	try {
		console.log(finalURL, registryTag);
		writeStream.write(
			`📦 [Enabled Registry] Uploading image to ${registry.registryType} | ${registryTag} | ${finalURL}\n`,
		);

		await spawnAsync(
			"docker",
			["login", finalURL, "-u", registry.username, "-p", registry.password],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
		);

		await spawnAsync("docker", ["tag", imageName, registryTag], (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});

		await spawnAsync("docker", ["push", registryTag], (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});
	} catch (error) {
		console.log(error);
		throw error;
	}
};
