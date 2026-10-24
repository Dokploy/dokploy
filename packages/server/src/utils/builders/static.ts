import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { getCreateFileCommand } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ApplicationNested } from ".";

const getNginxConfig = (isStaticSpa: boolean) => `
worker_processes 1;

events {
  worker_connections 1024;
}

http {
  include mime.types;
  default_type  application/octet-stream;

  access_log /dev/stdout;
  error_log /dev/stderr;

  # TLS terminates at Traefik, so nginx only sees http. Absolute redirects
  # (e.g. adding a directory's trailing slash) would downgrade to http://.
  absolute_redirect off;

  server {
    listen 80;
    location / {
      root   /usr/share/nginx/html;
      index  index.html index.htm;
      try_files $uri $uri/ ${isStaticSpa ? "/index.html" : "=404"};
    }
  }
}
`;

export const getStaticCommand = (application: ApplicationNested) => {
	const { publishDirectory, isStaticSpa } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	let command = getCreateFileCommand(
		buildAppDirectory,
		"nginx.conf",
		getNginxConfig(!!isStaticSpa),
	);

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
			"COPY nginx.conf /etc/nginx/nginx.conf",
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
