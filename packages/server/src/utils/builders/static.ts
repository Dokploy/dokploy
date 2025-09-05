import type { WriteStream } from "node:fs";
import {
	buildCustomDocker,
	getDockerCommand,
} from "@dokploy/server/utils/builders/docker-file";
import { createFile, getCreateFileCommand } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ApplicationNested } from ".";

const nginxSpaConfig = `
worker_processes 1;

events {
  worker_connections 1024;
}

http {
  include mime.types;
  default_type  application/octet-stream;

  access_log /dev/stdout;
  error_log /dev/stderr;

  server {
    listen 80;
    location / {
      root   /usr/share/nginx/html;
      index  index.html index.htm;
      try_files $uri $uri/ /index.html;
    }
  }
}
`;

export const buildStatic = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { publishDirectory, isStaticSpa } = application;
	const buildAppDirectory = getBuildAppDirectory(application);

	try {
		if (isStaticSpa) {
			createFile(buildAppDirectory, "nginx.conf", nginxSpaConfig);
		}

		createFile(
			buildAppDirectory,
			".dockerignore",
			[".git", ".env", "Dockerfile", ".dockerignore"].join("\n"),
		);

		createFile(
			buildAppDirectory,
			"Dockerfile",
			[
				"FROM nginx:alpine",
				"WORKDIR /usr/share/nginx/html/",
				isStaticSpa ? "COPY nginx.conf /etc/nginx/nginx.conf" : "",
				`COPY ${publishDirectory || "."} .`,
				'CMD ["nginx", "-g", "daemon off;"]',
			].join("\n"),
		);

		createFile(
			buildAppDirectory,
			".dockerignore",
			[".git", ".env", "Dockerfile", ".dockerignore"].join("\n"),
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
