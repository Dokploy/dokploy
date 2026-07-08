import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import { parse } from "shell-quote";
import { writeDomainsToCompose } from "../docker/domain";
import {
	encodeBase64,
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { normalizeRelativeFilePath } from "../filesystem/safe-path";
import {
	quoteEnvironmentAssignment,
	quoteShellArgs,
	quoteShellArgument,
} from "../shell";

export type ComposeNested = InferResultType<
	"compose",
	{ environment: { with: { project: true } }; mounts: true; domains: true }
>;

export const getBuildComposeCommand = async (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const command = createCommand(compose);
	const envCommand = getCreateEnvFileCommand(compose);
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const quotedProjectPath = quoteShellArgument(projectPath);
	const quotedAppName = quoteShellArgument(compose.appName);
	const exportEnvCommand = getExportEnvCommand(compose);

	const newCompose = await writeDomainsToCompose(compose, domains);
	const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: docker ${command}
Source Type: docker ${sourceType} ✅
Compose Type: ${composeType} ✅`;

	const logBox = boxen(logContent, {
		padding: {
			left: 1,
			right: 1,
			bottom: 1,
		},
		width: 80,
		borderStyle: "double",
	});

	const bashCommand = `
	set -e
	{
		echo ${quoteShellArgument(logBox)};

		${newCompose}

		${envCommand}

		cd ${quotedProjectPath};

		${compose.isolatedDeployment ? `docker network inspect ${quotedAppName} >/dev/null 2>&1 || docker network create ${compose.composeType === "stack" ? "--driver overlay" : ""} --attachable ${quotedAppName}` : ""}
		env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${command} 2>&1 || { echo "Error: ❌ Docker command failed"; exit 1; }
		${compose.isolatedDeployment ? `docker network connect ${quotedAppName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1` : ""}

		echo "Docker Compose Deployed: ✅";
	} || {
		echo "Error: ❌ Script execution failed";
		exit 1
	}
	`;

	return bashCommand;
};

const ALLOWED_CUSTOM_DOCKER_COMMANDS = new Set(["compose", "stack"]);
const ALLOWED_CUSTOM_COMPOSE_UP_FLAGS = new Set([
	"-d",
	"--build",
	"--remove-orphans",
	"--force-recreate",
	"--no-deps",
	"--wait",
]);
const ALLOWED_CUSTOM_COMPOSE_VALUE_OPTIONS = new Set(["-f", "--file"]);
const UNSAFE_CUSTOM_DOCKER_COMMAND_PATTERN = /[`$;&|<>()\r\n]/;

const throwInvalidCustomDockerCommand = (): never => {
	throw new Error("Invalid docker compose command");
};

const getLongOptionValue = (argument: string, option: string) => {
	if (argument === option) {
		return undefined;
	}
	if (argument.startsWith(`${option}=`)) {
		return argument.slice(option.length + 1);
	}
	return undefined;
};

const assertComposeProjectNameBound = (args: string[], appName: string) => {
	let hasProjectName = false;
	let subcommand: string | undefined;
	for (let index = 1; index < args.length; index += 1) {
		const current = args[index];
		if (!current) {
			continue;
		}

		if (current === "-p" || current === "--project-name") {
			const projectName = args[index + 1];
			if (!projectName || projectName !== appName) {
				throwInvalidCustomDockerCommand();
			}
			hasProjectName = true;
			index += 1;
			continue;
		}

		const longProjectName = getLongOptionValue(current, "--project-name");
		if (longProjectName !== undefined && longProjectName !== appName) {
			throwInvalidCustomDockerCommand();
		}
		if (longProjectName === appName) {
			hasProjectName = true;
			continue;
		}

		if (!subcommand) {
			const longFileValue = getLongOptionValue(current, "--file");
			if (longFileValue !== undefined) {
				if (!longFileValue) {
					throwInvalidCustomDockerCommand();
				}
				continue;
			}

			if (ALLOWED_CUSTOM_COMPOSE_VALUE_OPTIONS.has(current)) {
				const optionValue = args[index + 1];
				if (!optionValue) {
					throwInvalidCustomDockerCommand();
				}
				index += 1;
				continue;
			}
		}

		if (!subcommand) {
			if (current.startsWith("-")) {
				throwInvalidCustomDockerCommand();
			}
			subcommand = current;
			if (subcommand !== "up") {
				throwInvalidCustomDockerCommand();
			}
			continue;
		}

		if (!ALLOWED_CUSTOM_COMPOSE_UP_FLAGS.has(current)) {
			throwInvalidCustomDockerCommand();
		}
	}

	if (!hasProjectName || subcommand !== "up") {
		throwInvalidCustomDockerCommand();
	}
};

const assertStackNameBound = (args: string[], appName: string) => {
	if (args[1] !== "deploy") {
		throwInvalidCustomDockerCommand();
	}

	const valueOptions = new Set([
		"-c",
		"-f",
		"--compose-file",
		"--resolve-image",
	]);
	const operands: string[] = [];
	for (let index = 2; index < args.length; index += 1) {
		const current = args[index];
		if (!current) {
			continue;
		}
		if (current.startsWith("--")) {
			if (valueOptions.has(current) && !current.includes("=")) {
				index += 1;
			}
			continue;
		}
		if (current.startsWith("-")) {
			if (valueOptions.has(current)) {
				index += 1;
			}
			continue;
		}
		operands.push(current);
	}

	const stackName = operands.at(-1);
	if (!stackName || stackName !== appName) {
		throwInvalidCustomDockerCommand();
	}
};

const createCustomDockerCommand = (command: string, appName: string) => {
	const sanitizedCommand = command.trim();

	if (
		!sanitizedCommand ||
		UNSAFE_CUSTOM_DOCKER_COMMAND_PATTERN.test(sanitizedCommand)
	) {
		throwInvalidCustomDockerCommand();
	}

	const args: string[] = [];
	try {
		const parsed = parse(sanitizedCommand);
		for (const part of parsed) {
			if (typeof part !== "string") {
				throwInvalidCustomDockerCommand();
			}
			args.push(part as string);
		}
	} catch {
		throwInvalidCustomDockerCommand();
	}

	if (!ALLOWED_CUSTOM_DOCKER_COMMANDS.has(args[0] ?? "")) {
		throwInvalidCustomDockerCommand();
	}

	if (args[0] === "compose") {
		assertComposeProjectNameBound(args, appName);
	}

	if (args[0] === "stack") {
		assertStackNameBound(args, appName);
	}

	return quoteShellArgs(args);
};

export const createCommand = (compose: ComposeNested) => {
	const { composeType, appName, sourceType } = compose;
	if (compose.command) {
		return createCustomDockerCommand(compose.command, appName);
	}

	const path =
		sourceType === "raw"
			? "docker-compose.yml"
			: normalizeRelativeFilePath(compose.composePath);

	if (composeType === "docker-compose") {
		return quoteShellArgs([
			"compose",
			"-p",
			appName,
			"-f",
			path,
			"up",
			"-d",
			"--build",
			"--remove-orphans",
		]);
	}
	if (composeType === "stack") {
		return quoteShellArgs([
			"stack",
			"deploy",
			"-c",
			path,
			appName,
			"--prune",
			"--with-registry-auth",
		]);
	}

	return "";
};

export const getCreateEnvFileCommand = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { env, composePath, appName } = compose;
	const safeComposePath = normalizeRelativeFilePath(
		composePath || "docker-compose.yml",
	);
	const composeFilePath = join(COMPOSE_PATH, appName, "code", safeComposePath);

	const envFilePath = join(dirname(composeFilePath), ".env");

	let envContent = `APP_NAME=${appName}\n`;
	envContent += `COMPOSE_PROJECT_NAME=${appName}\n`;
	envContent += env || "";
	if (!envContent.includes("DOCKER_CONFIG")) {
		envContent += "\nDOCKER_CONFIG=/root/.docker";
	}

	if (compose.randomize) {
		envContent += `\nCOMPOSE_PREFIX=${compose.suffix}`;
	}

	const envFileContent = prepareEnvironmentVariables(
		envContent,
		compose.environment.project.env,
		compose.environment.env,
	).join("\n");

	const encodedContent = encodeBase64(envFileContent);
	const quotedEnvFilePath = quoteShellArgument(envFilePath);
	return `
touch ${quotedEnvFilePath};
printf %s ${quoteShellArgument(encodedContent)} | base64 -d > ${quotedEnvFilePath};
		`;
};

const getExportEnvCommand = (compose: ComposeNested) => {
	if (compose.composeType !== "stack") return "";

	const envVars = getEnvironmentVariablesObject(
		compose.env,
		compose.environment.project.env,
		compose.environment.env,
	);
	const exports = Object.entries(envVars)
		.map(([key, value]) => quoteEnvironmentAssignment(key, value))
		.join(" ");

	return exports ? `${exports}` : "";
};
