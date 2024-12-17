import type { WriteStream } from "node:fs";
import {
	buildCustomDocker,
	getDockerCommand,
} from "@dokploy/server/utils/builders/docker-file";
import type { ApplicationNested } from ".";
import { createFile, getCreateFileCommand } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";

export const buildStatic = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { publishDirectory } = application;
	const buildAppDirectory = getBuildAppDirectory(application);

	try {
		createFile(
			buildAppDirectory,
			"Dockerfile",
			[
				"FROM nginx:alpine",
				"WORKDIR /usr/share/nginx/html/",
				`COPY ${publishDirectory || "."} .`,
			].join("\n"),
		);

		await buildCustomDocker(
			{
				...application,
				buildType: "dockerfile",
				dockerfile: "Dockerfile",
			},
			writeStream,
		);

		return true;
	} catch (e) {
		throw e;
	}
};

export const getStaticCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const { publishDirectory } = application;
	const buildAppDirectory = getBuildAppDirectory(application);

	let command = getCreateFileCommand(
		buildAppDirectory,
		"Dockerfile",
		[
			"FROM nginx:alpine",
			"WORKDIR /usr/share/nginx/html/",
			`COPY ${publishDirectory || "."} .`,
		].join("\n"),
	);

	command += getDockerCommand(
		{
			...application,
			buildType: "dockerfile",
			dockerfile: "Dockerfile",
		},
		logPath,
	);
	return command;
};
