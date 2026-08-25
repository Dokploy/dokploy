import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import { quote } from "shell-quote";
import { getComposePath, writeDomainsToCompose } from "../docker/domain";
import {
	encodeBase64,
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForFile,
} from "../docker/utils";
import { withResolvedVaultRefs } from "../vault";

export const ROLLBACK_OK_MARKER = "__DOKPLOY_ROLLBACK_OK__";

export type ComposeNested = InferResultType<
	"compose",
	{ environment: { with: { project: true } }; mounts: true; domains: true }
>;

export const getBuildComposeCommand = async (
	rawCompose: ComposeNested,
	deploymentId?: string,
) => {
	const compose = await withResolvedVaultRefs(rawCompose);
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const command = createCommand(compose);
	const envCommand = compose.createEnvFile
		? getCreateEnvFileCommand(compose)
		: "";
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
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

	const backupDir = join(COMPOSE_PATH, compose.appName, ".deploy-backup");
	const composeFilePath = getComposePath(compose);
	const envFilePath = join(dirname(composeFilePath), ".env");
	const isTransactional = composeType === "docker-compose";
	const restoreCommand = command
		.split(" ")
		.join(" ")
		.replace(/ --build/g, "");
	const rollbackMarkerLine = deploymentId
		? `${ROLLBACK_OK_MARKER}:${deploymentId}`
		: ROLLBACK_OK_MARKER;
	const isEnvRequired = compose.createEnvFile ? "1" : "0";

	const restoreCommands = isTransactional
		? `
		echo "Restoring previous working deployment... ⏪";
		RESTORE_FILES_OK=1;
		cp "${backupDir}/last-good-docker-compose.yml.bak" "${composeFilePath}" 2>/dev/null || cp "${backupDir}/docker-compose.yml.bak" "${composeFilePath}" 2>/dev/null || RESTORE_FILES_OK=0;
		RESTORE_ENV_OK=1;
		cp "${backupDir}/last-good-env.bak" "${envFilePath}" 2>/dev/null || cp "${backupDir}/env.bak" "${envFilePath}" 2>/dev/null || RESTORE_ENV_OK=0;
		if [ "$RESTORE_ENV_OK" = "0" ] && { [ "${isEnvRequired}" = "1" ] || [ -f "${backupDir}/last-good-env.bak" -o -f "${backupDir}/env.bak" ]; }; then RESTORE_FILES_OK=0; echo "Warning: ⚠️ Previous .env could not be restored"; fi
		env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${restoreCommand} 2>&1 && [ "$RESTORE_FILES_OK" = "1" ] && echo "${rollbackMarkerLine}" || echo "Warning: ⚠️ Automatic restore failed, manual intervention may be required";
		`
		: "";

	const persistLastGood = isTransactional
		? `
		mkdir -p "${backupDir}";
		cp "${composeFilePath}" "${backupDir}/last-good-docker-compose.yml.bak" 2>/dev/null || true;
		cp "${envFilePath}" "${backupDir}/last-good-env.bak" 2>/dev/null || true;
		`
		: "";

	const bashCommand = `
	set -e
	{
		echo "${logBox}";

		${newCompose}

		${envCommand}

		cd "${projectPath}";

		${compose.isolatedDeployment ? `docker network inspect ${compose.appName} >/dev/null 2>&1 || docker network create ${compose.composeType === "stack" ? "--driver overlay" : ""} --attachable ${compose.appName}` : ""}
		env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${command.split(" ").join(" ")} 2>&1 || { echo "Error: ❌ Docker command failed"; ${restoreCommands} exit 1; }
		${compose.isolatedDeployment ? `docker network connect ${compose.appName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1` : ""}

		${persistLastGood}

		echo "Docker Compose Deployed: ✅";
	} || {
		echo "Error: ❌ Script execution failed";
		exit 1
	}
	`;

	return bashCommand;
};

// Shell control characters that must never appear in a user-provided compose
// command: they would let it break out of the `docker ${command}` invocation
// into arbitrary host commands. A normal docker compose CLI line never needs them.
// Removed '&' from the blocklist to allow '&&' chaining
const UNSAFE_COMPOSE_COMMAND = /[;|`$(){}<>\n\\]/;

const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	if (UNSAFE_COMPOSE_COMMAND.test(sanitizedCommand)) {
		throw new Error(
			"Invalid characters in compose command: shell control characters are not allowed",
		);
	}

	if (sanitizedCommand.includes("&")) {
		// Block single '&' (e.g., backgrounding tasks) or malformed chains like '&&&'
		if (
			/(?<!&)&(?!&)/.test(sanitizedCommand) ||
			sanitizedCommand.includes("&&&")
		) {
			throw new Error("Single '&' is not allowed. Use '&&' for chaining.");
		}

		// Split by '&&' and check that every chained command (skipping the first one) is safe
		const chains = sanitizedCommand.split("&&").map((cmd) => cmd.trim());
		const isSafeChain = chains
			.slice(1)
			.every(
				(cmd) =>
					cmd.startsWith("docker compose ") ||
					cmd.startsWith("docker-compose "),
			);

		if (!isSafeChain) {
			throw new Error(
				"Chained commands must strictly start with 'docker compose '",
			);
		}
	}

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
		command = `compose -p ${quote([appName])} -f ${quote([path])} up -d --build --remove-orphans`;
	} else if (composeType === "stack") {
		command = `stack deploy -c ${quote([path])} ${quote([appName])} --prune --with-registry-auth`;
	}

	return command;
};

export const getCreateEnvFileCommand = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { env, composePath, appName } = compose;
	const composeFilePath =
		join(COMPOSE_PATH, appName, "code", composePath) ||
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

	const envFileContent = (
		compose.composeType === "stack"
			? prepareEnvironmentVariables(
					envContent,
					compose.environment.project.env,
					compose.environment.env,
				)
			: prepareEnvironmentVariablesForFile(
					envContent,
					compose.environment.project.env,
					compose.environment.env,
				)
	).join("\n");

	const encodedContent = encodeBase64(envFileContent);
	return `
touch ${quote([envFilePath])};
echo "${encodedContent}" | base64 -d > ${quote([envFilePath])};
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
