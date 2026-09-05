import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	createServerTraefikConfigCommand,
	createTraefikInstance,
} from "@dokploy/server";
import { afterEach, expect, it } from "vitest";
import { parse } from "yaml";

const temporaryDirectories: string[] = [];

const createDockerSandbox = (swarmRole: "active false" | "active true") => {
	const root = mkdtempSync(path.join(tmpdir(), "dokploy-traefik-worker-"));
	temporaryDirectories.push(root);
	const binDirectory = path.join(root, "bin");
	const restartMarker = path.join(root, "traefik-restarted");
	mkdirSync(binDirectory);

	const dockerShim = path.join(binDirectory, "docker");
	writeFileSync(
		dockerShim,
		`#!/bin/sh
case "$1" in
  info)
    echo "${swarmRole}"
    ;;
  service)
    exit 1
    ;;
  inspect)
    exit 0
    ;;
  restart)
    touch "${restartMarker}"
    ;;
esac
`,
	);
	chmodSync(dockerShim, 0o755);

	return { binDirectory, restartMarker, root };
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

it("repairs an existing worker config and restarts Traefik", () => {
	const { binDirectory, restartMarker, root } =
		createDockerSandbox("active false");
	const configDirectory = path.join(root, "traefik");
	const dynamicDirectory = path.join(configDirectory, "dynamic");
	const configPath = path.join(configDirectory, "traefik.yml");
	mkdirSync(dynamicDirectory, { recursive: true });
	writeFileSync(
		configPath,
		`providers:
  docker:
    exposedByDefault: false
  file:
    directory: /custom/dynamic
  swarm:
    exposedByDefault: false
    watch: true
log:
  level: DEBUG
`,
	);

	const command = `${createServerTraefikConfigCommand()}
${createTraefikInstance()}`.replaceAll("/etc/dokploy", root);
	execFileSync("/bin/bash", ["-c", command], {
		env: {
			...process.env,
			PATH: `${binDirectory}:${process.env.PATH}`,
			SUDO_CMD: "",
		},
	});

	const config = parse(readFileSync(configPath, "utf8"));
	expect(config.providers.swarm).toBeUndefined();
	expect(config.providers.docker).toBeDefined();
	expect(config.providers.file.directory).toBe("/custom/dynamic");
	expect(config.log.level).toBe("DEBUG");
	expect(readFileSync(restartMarker, "utf8")).toBe("");
});

it("repairs an existing manager config and restarts Traefik", () => {
	const { binDirectory, restartMarker, root } =
		createDockerSandbox("active true");
	const configDirectory = path.join(root, "traefik");
	const dynamicDirectory = path.join(configDirectory, "dynamic");
	const configPath = path.join(configDirectory, "traefik.yml");
	mkdirSync(dynamicDirectory, { recursive: true });
	writeFileSync(
		configPath,
		`providers:
  docker:
    exposedByDefault: false
  file:
    directory: /custom/dynamic
log:
  level: DEBUG
`,
	);

	const command = `${createServerTraefikConfigCommand()}
${createTraefikInstance()}`.replaceAll("/etc/dokploy", root);
	execFileSync("/bin/bash", ["-c", command], {
		env: {
			...process.env,
			PATH: `${binDirectory}:${process.env.PATH}`,
			SUDO_CMD: "",
		},
	});

	const config = parse(readFileSync(configPath, "utf8"));
	expect(config.providers.swarm).toEqual({
		exposedByDefault: false,
		watch: true,
	});
	expect(config.providers.file.directory).toBe("/custom/dynamic");
	expect(config.log.level).toBe("DEBUG");
	expect(readFileSync(restartMarker, "utf8")).toBe("");
});
