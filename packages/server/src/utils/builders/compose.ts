import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	findRegistryByIdWithCredentials,
	safeDockerLoginCommand,
} from "@dokploy/server/services/registry";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import { quote } from "shell-quote";
import {
	addDomainToCompose,
	hasBuildableServices,
	writeDomainsToCompose,
} from "../docker/domain";
import {
	encodeBase64,
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForFile,
} from "../docker/utils";
import { withResolvedVaultRefs } from "../vault";

export type ComposeNested = InferResultType<
	"compose",
	{
		environment: { with: { project: true } };
		mounts: true;
		domains: true;
		buildRegistry: { columns: { password: false } };
	}
>;

type CreateCommandOptions = {
	prebuilt?: boolean;
	projectPath?: string;
};

export const getBuildComposeCommand = async (
	rawCompose: ComposeNested,
	options?: { prebuilt?: boolean; targetServerId?: string | null },
) => {
	const compose = await withResolvedVaultRefs(rawCompose);
	const targetServerId = options?.targetServerId ?? compose.serverId;
	const isRemote = !!targetServerId;
	const { COMPOSE_PATH } = paths(isRemote);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const prebuilt = options?.prebuilt ?? Boolean(compose.buildServerId);
	const command = createCommand(compose, {
		prebuilt,
		projectPath: mounts.length > 0 ? projectPath : undefined,
	});
	const envCommand = compose.createEnvFile
		? getCreateEnvFileCommand(compose, targetServerId)
		: "";
	const exportEnvCommand = getExportEnvCommand(compose);

	const buildRegistry =
		prebuilt && compose.buildRegistryId
			? await findRegistryByIdWithCredentials(compose.buildRegistryId)
			: undefined;

	const registryLoginCommand = buildRegistry
		? `${safeDockerLoginCommand(
				buildRegistry.registryUrl,
				buildRegistry.username,
				buildRegistry.password,
			)} || { echo "❌ Registry login failed"; exit 1; }`
		: "";

	const newCompose = await writeDomainsToCompose(compose, domains, {
		buildRegistry,
		loadServerId: targetServerId,
	});

	const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: docker ${command}
Source Type: docker ${sourceType} ✅
Compose Type: ${composeType} ✅
Remote Build: ${prebuilt ? "enabled (pre-built images)" : "disabled"}`;

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

		${registryLoginCommand}

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

export const getComposeRemoteBuildCommand = async (
	rawCompose: ComposeNested,
	buildServerId: string,
) => {
	const compose = await withResolvedVaultRefs(rawCompose);
	if (!compose.buildRegistryId) {
		throw new Error("Build registry is required for remote compose builds");
	}

	const buildRegistry = await findRegistryByIdWithCredentials(
		compose.buildRegistryId,
	);
	const { COMPOSE_PATH } = paths(true);
	const { sourceType, appName, composeType } = compose;
	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");

	const loadCompose = { ...compose, serverId: buildServerId };
	const composeSpec = await addDomainToCompose(loadCompose, []);

	if (!composeSpec || !hasBuildableServices(composeSpec)) {
		return `
echo "ℹ️ No services with build: defined — skipping remote build phase";
`;
	}

	const composeWrite = await writeDomainsToCompose(compose, [], {
		buildRegistry,
		loadServerId: buildServerId,
	});
	const envCommand = compose.createEnvFile
		? getCreateEnvFileCommand(compose, buildServerId)
		: "";
	const loginCommand = `${safeDockerLoginCommand(
		buildRegistry.registryUrl,
		buildRegistry.username,
		buildRegistry.password,
	)} || { echo "❌ Registry login failed"; exit 1; }`;

	const logContent = `
App Name: ${appName}
Remote Build Compose 🐳
Build Server: ${buildServerId}
Compose Type: ${composeType} ✅`;

	const logBox = boxen(logContent, {
		padding: { left: 1, right: 1, bottom: 1 },
		width: 80,
		borderStyle: "double",
	});

	return `
	set -e
	{
		echo "${logBox}";

		${composeWrite}

		${envCommand}

		cd "${projectPath}";

		${loginCommand}

		env -i PATH="$PATH" HOME="$HOME" docker compose -p ${quote([appName])} -f ${quote([path])} build 2>&1 || { echo "Error: ❌ Docker compose build failed"; exit 1; }
		env -i PATH="$PATH" HOME="$HOME" docker compose -p ${quote([appName])} -f ${quote([path])} push 2>&1 || { echo "Error: ❌ Docker compose push failed"; exit 1; }

		echo "Remote Compose Build & Push: ✅";
	} || {
		echo "Error: ❌ Remote build script execution failed";
		exit 1
	}
	`;
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

export const createCommand = (
	compose: ComposeNested,
	options?: CreateCommandOptions | string,
) => {
	const { prebuilt, projectPath } =
		typeof options === "string"
			? { projectPath: options }
			: (options ?? {});
	const { composeType, appName, sourceType } = compose;
	if (compose.command) {
		return `${sanitizeCommand(compose.command)}`;
	}

	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	let command = "";

	if (composeType === "docker-compose") {
		const projectDirectoryFlag = projectPath
			? `--project-directory ${quote([projectPath])} `
			: "";
		const envFileFlag = compose.createEnvFile
			? `--env-file ${quote([join(dirname(compose.composePath || "docker-compose.yml"), ".env")])} `
			: "";
		if (prebuilt) {
			command = `compose -p ${quote([appName])} ${projectDirectoryFlag}${envFileFlag}-f ${quote([path])} pull && compose -p ${quote([appName])} ${projectDirectoryFlag}${envFileFlag}-f ${quote([path])} up -d --no-build --remove-orphans`;
		} else {
			command = `compose -p ${quote([appName])} ${projectDirectoryFlag}${envFileFlag}-f ${quote([path])} up -d --build --remove-orphans`;
		}
	} else if (composeType === "stack") {
		command = `stack deploy -c ${quote([path])} ${quote([appName])} --prune --with-registry-auth`;
	}

	return command;
};

export const getCreateEnvFileCommand = (
	compose: ComposeNested,
	targetServerId?: string | null,
) => {
	const { COMPOSE_PATH } = paths(!!(targetServerId ?? compose.serverId));
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
