import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	type Registry,
	safeDockerLoginCommand,
} from "@dokploy/server/services/registry";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import { quote } from "shell-quote";
import { getRegistryTag } from "../cluster/upload";
import {
	addDomainToCompose,
	applyBuildPlatform,
	applyPrebuiltImages,
	hasBuildableServices,
	writeDomainsToCompose,
} from "../docker/domain";
import type { ComposeSpecification } from "../docker/types";
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

export type PrebuiltImages = {
	registry: Registry;
	images: Record<string, string>;
};

type CreateCommandOptions = {
	prebuilt?: boolean;
	projectPath?: string;
};

const getRegistryLoginCommand = (registry: Registry) =>
	`${safeDockerLoginCommand(
		registry.registryUrl,
		registry.username,
		registry.password,
	)} || { echo "❌ Registry login failed"; exit 1; }`;

export const getBuildComposeCommand = async (
	rawCompose: ComposeNested,
	options?: { targetServerId?: string | null; prebuilt?: PrebuiltImages },
) => {
	const compose = await withResolvedVaultRefs(rawCompose);
	const targetServerId =
		options?.targetServerId !== undefined
			? options.targetServerId
			: compose.serverId;
	const { COMPOSE_PATH } = paths(!!targetServerId);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const prebuilt = options?.prebuilt;
	const prebuiltServices = Object.keys(prebuilt?.images ?? {});
	const projectDirectory = mounts.length > 0 ? projectPath : undefined;
	const command = createCommand(compose, {
		prebuilt: !!prebuilt,
		projectPath: projectDirectory,
	});
	const envCommand = compose.createEnvFile
		? getCreateEnvFileCommand(compose, targetServerId)
		: "";
	const exportEnvCommand = getExportEnvCommand(compose);

	const registryLoginCommand =
		prebuilt && prebuiltServices.length > 0
			? getRegistryLoginCommand(prebuilt.registry)
			: "";

	const pullCommand =
		prebuiltServices.length > 0 && composeType === "docker-compose"
			? `env -i PATH="$PATH" HOME="$HOME" docker ${getComposeBaseArgs(compose, projectDirectory)} pull ${quote(prebuiltServices)} 2>&1 || { echo "Error: ❌ Pulling prebuilt images failed"; exit 1; }`
			: "";

	const newCompose = await writeDomainsToCompose(compose, domains, {
		loadServerId: targetServerId,
		transform: prebuilt
			? (spec) => applyPrebuiltImages(spec, prebuilt.images)
			: undefined,
	});

	const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: docker ${command}
Source Type: docker ${sourceType} ✅
Compose Type: ${composeType} ✅
Remote Build: ${prebuilt ? `enabled (${prebuiltServices.length} prebuilt images)` : "disabled"}`;

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

		${pullCommand}

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

const sanitizeImageName = (name: string) =>
	name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");

export const applyDefaultBuildImageNames = (
	spec: ComposeSpecification,
	appName: string,
): ComposeSpecification => {
	const result = structuredClone(spec);
	for (const [serviceName, service] of Object.entries(result.services ?? {})) {
		if (service?.build && !service.image) {
			service.image = `${sanitizeImageName(appName)}-${sanitizeImageName(serviceName)}`;
		}
	}
	return result;
};

export const getComposeRemoteBuildCommand = async (
	rawCompose: ComposeNested,
	buildServerId: string,
	registry: Registry,
	options?: { platform?: string },
) => {
	const compose = await withResolvedVaultRefs(rawCompose);
	const { COMPOSE_PATH } = paths(true);
	const { appName, composeType, mounts } = compose;
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");

	const composeSpec = await addDomainToCompose(
		{ ...compose, serverId: buildServerId },
		[],
	);
	if (!composeSpec || !hasBuildableServices(composeSpec)) {
		return null;
	}

	const platform = options?.platform;
	const composeWrite = await writeDomainsToCompose(compose, [], {
		loadServerId: buildServerId,
		transform: (spec) => {
			const named = applyDefaultBuildImageNames(spec, appName);
			return platform ? applyBuildPlatform(named, platform) : named;
		},
	});
	const envCommand = compose.createEnvFile
		? getCreateEnvFileCommand(compose, buildServerId)
		: "";
	const exportEnvCommand = getExportEnvCommand(compose);
	const baseArgs = getComposeBaseArgs(
		compose,
		mounts.length > 0 ? projectPath : undefined,
	);

	const logContent = `
App Name: ${appName}
Remote Build Compose 🐳
Compose Type: ${composeType} ✅
Target Platform: ${platform ?? "native"}`;

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

		${getRegistryLoginCommand(registry)}

		env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${baseArgs} build 2>&1 || { echo "Error: ❌ Docker compose build failed"; exit 1; }

		echo "Remote Compose Build: ✅";
	} || {
		echo "Error: ❌ Remote build script execution failed";
		exit 1
	}
	`;
};

export const getComposeConfigCommand = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(true);
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const baseArgs = getComposeBaseArgs(
		compose,
		compose.mounts.length > 0 ? projectPath : undefined,
	);
	return `cd ${quote([projectPath])} && env -i PATH="$PATH" HOME="$HOME" ${getExportEnvCommand(compose)} docker ${baseArgs} config --format json`;
};

type ComposeConfigOutput = {
	services?: Record<string, { image?: string; build?: unknown } | null>;
};

export const resolveBuiltImages = (configJson: string) => {
	const config = JSON.parse(configJson) as ComposeConfigOutput;
	return Object.entries(config.services ?? {}).flatMap(
		([service, definition]) =>
			definition?.build && definition.image
				? [{ service, localImage: definition.image }]
				: [],
	);
};

export const getRemoteImageRef = (
	registry: Registry,
	appName: string,
	service: string,
	tag: string,
) =>
	getRegistryTag(
		registry,
		`${sanitizeImageName(appName)}-${sanitizeImageName(service)}:${tag}`,
	);

export const sanitizeImageTag = (tag: string) =>
	tag
		.replace(/[^A-Za-z0-9_.-]/g, "-")
		.replace(/^[.-]+/, "")
		.slice(0, 128);

export const getPushImagesCommand = (
	registry: Registry,
	images: { localImage: string; remoteImage: string }[],
) => {
	const pushes = images
		.map(
			({ localImage, remoteImage }) => `
		echo ${quote([`📦 Pushing ${localImage} → ${remoteImage}`])};
		docker tag ${quote([localImage])} ${quote([remoteImage])} 2>&1;
		docker push ${quote([remoteImage])} 2>&1 || { echo ${quote([`Error: ❌ Push failed for ${remoteImage}`])}; exit 1; }`,
		)
		.join("\n");
	const untag = images
		.map(
			({ remoteImage }) =>
				`docker rmi ${quote([remoteImage])} >/dev/null 2>&1 || true;`,
		)
		.join("\n");

	return `
	set -e
	{
		${getRegistryLoginCommand(registry)}
		${pushes}
		${untag}
		echo "Remote Compose Push: ✅";
	} || {
		echo "Error: ❌ Pushing images failed";
		exit 1
	}
	`;
};

const UNSAFE_COMPOSE_COMMAND = /[;|`$(){}<>\n\\]/;

const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	if (UNSAFE_COMPOSE_COMMAND.test(sanitizedCommand)) {
		throw new Error(
			"Invalid characters in compose command: shell control characters are not allowed",
		);
	}

	if (sanitizedCommand.includes("&")) {
		if (
			/(?<!&)&(?!&)/.test(sanitizedCommand) ||
			sanitizedCommand.includes("&&&")
		) {
			throw new Error("Single '&' is not allowed. Use '&&' for chaining.");
		}

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

export const getComposeBaseArgs = (
	compose: ComposeNested,
	projectPath?: string,
) => {
	const { appName, sourceType } = compose;
	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	const projectDirectoryFlag = projectPath
		? `--project-directory ${quote([projectPath])} `
		: "";
	const envFileFlag = compose.createEnvFile
		? `--env-file ${quote([join(dirname(compose.composePath || "docker-compose.yml"), ".env")])} `
		: "";
	return `compose -p ${quote([appName])} ${projectDirectoryFlag}${envFileFlag}-f ${quote([path])}`;
};

export const createCommand = (
	compose: ComposeNested,
	options?: CreateCommandOptions | string,
) => {
	const { prebuilt, projectPath } =
		typeof options === "string" ? { projectPath: options } : (options ?? {});
	const { composeType, sourceType } = compose;
	if (compose.command) {
		return `${sanitizeCommand(compose.command)}`;
	}

	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	let command = "";

	if (composeType === "docker-compose") {
		const pullFlag = compose.pullImages ? " --pull always" : "";
		const buildFlag = prebuilt ? "--no-build" : "--build";
		command = `${getComposeBaseArgs(compose, projectPath)} up -d ${buildFlag} --remove-orphans${pullFlag}`;
	} else if (composeType === "stack") {
		command = `stack deploy -c ${quote([path])} ${quote([compose.appName])} --prune --with-registry-auth`;
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
