import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { getCreateFileCommand } from "../docker/utils";
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

export const getStaticCommand = (application: ApplicationNested) => {
	const { publishDirectory, isStaticSpa } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	let command = "";
	if (isStaticSpa) {
		command += getCreateFileCommand(
			buildAppDirectory,
			"nginx.conf",
			nginxSpaConfig,
		);
	}

	command += getCreateFileCommand(
		buildAppDirectory,
		".dockerignore",
		[".git", ".env", "Dockerfile", ".dockerignore"].join("\n"),
	);

	command += getCreateFileCommand(
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

	command += getDockerCommand({
		...application,
		buildType: "dockerfile",
		dockerfile: "Dockerfile",
	});
	return command;
};
