import type { WriteStream } from "node:fs";
import path, { join } from "node:path";
import type { ApplicationNested } from "../builders";
import { spawnAsync } from "../process/spawnAsync";

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

	const finalURL = registryUrl;

	const registryTag = path
		.join(registryUrl, join(imagePrefix || "", imageName))
		.replace(/\/+/g, "/");

	try {
		writeStream.write(
			`📦 [Enabled Registry] Uploading image to ${registry.registryType} | ${imageName} | ${finalURL}\n`,
		);
		const loginCommand = spawnAsync(
			"docker",
			["login", finalURL, "-u", registry.username, "--password-stdin"],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
		);
		loginCommand.child?.stdin?.write(registry.password);
		loginCommand.child?.stdin?.end();
		await loginCommand;

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

export const uploadImageRemoteCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const registry = application.registry;

	if (!registry) {
		throw new Error("Registry not found");
	}

	const { registryUrl, imagePrefix } = registry;
	const { appName } = application;
	const imageName = `${appName}:latest`;

	const finalURL = registryUrl;

	const registryTag = path
		.join(registryUrl, join(imagePrefix || "", imageName))
		.replace(/\/+/g, "/");

	try {
		const command = `
		echo "📦 [Enabled Registry] Uploading image to '${registry.registryType}' | '${registryTag}'" >> ${logPath};
		echo "${registry.password}" | docker login ${finalURL} -u ${registry.username} --password-stdin >> ${logPath} 2>> ${logPath} || { 
			echo "❌ DockerHub Failed" >> ${logPath};
			exit 1;
		}
		echo "✅ Registry Login Success" >> ${logPath};
		docker tag ${imageName} ${registryTag} >> ${logPath} 2>> ${logPath} || { 
			echo "❌ Error tagging image" >> ${logPath};
			exit 1;
		}
		echo "✅ Image Tagged" >> ${logPath};
		docker push ${registryTag} 2>> ${logPath} || { 
			echo "❌ Error pushing image" >> ${logPath};
			exit 1;
		}
			echo "✅ Image Pushed" >> ${logPath};
		`;
		return command;
	} catch (error) {
		throw error;
	}
};
