import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import { quote } from "shell-quote";
import { sanitizeComposeProfiles } from "../compose/profiles";
import { sanitizeComposeWorkingDir } from "../compose/working-dir";
import { writeDomainsToCompose } from "../docker/domain";
import {
	encodeBase64,
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
} from "../docker/utils";

export {
	sanitizeComposeProfiles,
	VALID_COMPOSE_PROFILE_REGEX,
} from "../compose/profiles";
export { sanitizeComposeWorkingDir } from "../compose/working-dir";

export type ComposeNested = InferResultType<
	"compose",
	{ environment: { with: { project: true } }; mounts: true; domains: true }
>;

// Resolves the absolute directory from which `docker compose` should run.
export const getComposeRunPath = (
	compose: Pick<ComposeNested, "appName" | "composeWorkingDir">,
	composePath: string,
) => {
	const base = join(composePath, compose.appName, "code");
	const workingDir = sanitizeComposeWorkingDir(compose.composeWorkingDir);
	return workingDir ? join(base, workingDir) : base;
};

// Builds the `--profile foo --profile bar` fragment that's inserted right
// after `compose` so only the requested service set is brought up. Stack mode
// is ignored because Swarm's `stack deploy` doesn't honor compose profiles.
export const buildComposeProfilesFlags = (
	compose: Pick<ComposeNested, "composeProfiles" | "composeType">,
) => {
	if (compose.composeType !== "docker-compose") return "";
	const profiles = sanitizeComposeProfiles(compose.composeProfiles);
	if (!profiles.length) return "";
	return profiles.map((p) => `--profile ${p}`).join(" ");
};

export const getBuildComposeCommand = async (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const command = createCommand(compose);
	const envCommand = getCreateEnvFileCommand(compose);
	const projectPath = getComposeRunPath(compose, COMPOSE_PATH);
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
		echo "${logBox}";

		${newCompose}

		${envCommand}

		cd "${projectPath}";

		${compose.isolatedDeployment ? `docker network inspect ${compose.appName} >/dev/null 2>&1 || docker network create ${compose.composeType === "stack" ? "--driver overlay" : ""} --attachable ${compose.appName}` : ""}
		env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${command.split(" ").join(" ")} 2>&1 || { echo "Error: ❌ Docker command failed"; exit 1; }
		${compose.isolatedDeployment ? `docker network connect ${compose.appName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1` : ""}

		echo "Docker Compose Deployed: ✅";
	} || {
		echo "Error: ❌ Script execution failed";
		exit 1
	}
	`;

	return bashCommand;
};

const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	const parts = sanitizedCommand.split(/\s+/);

	const restCommand = parts.map((arg) => arg.replace(/^"(.*)"$/, "$1"));

	return restCommand.join(" ");
};

export const createCommand = (compose: ComposeNested) => {
	const { composeType, appName, sourceType } = compose;
	if (compose.command) {
		return `${sanitizeCommand(compose.command)}`;
	}

	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	let command = "";

	if (composeType === "docker-compose") {
		const profilesFlags = buildComposeProfilesFlags(compose);
		const profilesPart = profilesFlags ? `${profilesFlags} ` : "";
		command = `compose ${profilesPart}-p ${appName} -f ${path} up -d --build --remove-orphans`;
	} else if (composeType === "stack") {
		command = `stack deploy -c ${path} ${appName} --prune --with-registry-auth`;
	}

	return command;
};

export const getCreateEnvFileCommand = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { env, composePath, appName } = compose;
	const runPath = getComposeRunPath(compose, COMPOSE_PATH);
	const composeFilePath =
		join(runPath, composePath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.yml");

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
	return `
touch ${envFilePath};
echo "${encodedContent}" | base64 -d > "${envFilePath}";
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
		.map(([key, value]) => `${key}=${quote([value])}`)
		.join(" ");

	return exports ? `${exports}` : "";
};
