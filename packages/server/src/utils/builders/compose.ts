import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import dotenv from "dotenv";
import {
	writeDomainsToCompose,
	writeDomainsToComposeRemote,
} from "../docker/domain";
import { encodeBase64, prepareEnvironmentVariables } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export type ComposeNested = InferResultType<
	"compose",
	{ project: true; mounts: true; domains: true }
>;
export const buildCompose = async (compose: ComposeNested, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { sourceType, appName, mounts, composeType, domains } = compose;
	try {
		const { COMPOSE_PATH } = paths();
		const command = createCommand(compose);
		await writeDomainsToCompose(compose, domains);
		createEnvFile(compose);
		processComposeFile(compose);

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
		writeStream.write(`\n${logBox}\n`);

		const projectPath = join(COMPOSE_PATH, compose.appName, "code");
		await spawnAsync(
			"docker",
			[...command.split(" ")],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data.toString());
				}
			},
			{
				cwd: projectPath,
				env: {
					NODE_ENV: process.env.NODE_ENV,
					PATH: process.env.PATH,
				},
			},
		);

		writeStream.write("Docker Compose Deployed: ✅");
	} catch (error) {
		writeStream.write("Error ❌");
		throw error;
	} finally {
		writeStream.end();
	}
};

export const getBuildComposeCommand = async (
	compose: ComposeNested,
	logPath: string,
) => {
	const { COMPOSE_PATH } = paths(true);
	const { sourceType, appName, mounts, composeType, domains, composePath } =
		compose;
	const command = createCommand(compose);
	const envCommand = getCreateEnvFileCommand(compose);
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const processComposeFileCommand = getProcessComposeFileCommand(compose);

	const newCompose = await writeDomainsToComposeRemote(
		compose,
		domains,
		logPath,
	);
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
		echo "${logBox}" >> "${logPath}"
	
		${newCompose}
	
		${envCommand}
	
		cd "${projectPath}";

		${processComposeFileCommand}

		docker ${command.split(" ").join(" ")} >> "${logPath}" 2>&1 || { echo "Error: ❌ Docker command failed" >> "${logPath}"; exit 1; }
	
		echo "Docker Compose Deployed: ✅" >> "${logPath}"
	} || {
		echo "Error: ❌ Script execution failed" >> "${logPath}"
		exit 1
	}
	`;

	return await execAsyncRemote(compose.serverId, bashCommand);
};

const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	const parts = sanitizedCommand.split(/\s+/);

	const restCommand = parts.map((arg) => arg.replace(/^"(.*)"$/, "$1"));

	return restCommand.join(" ");
};

export const createCommand = (compose: ComposeNested) => {
	const { composeType, appName, sourceType } = compose;

	const path =
		sourceType === "raw" ? "docker-compose.processed.yml" : compose.composePath;
	let command = "";

	if (composeType === "docker-compose") {
		command = `compose -p ${appName} -f ${path} up -d --build --remove-orphans`;
	} else if (composeType === "stack") {
		command = `stack deploy -c ${path} ${appName} --prune`;
	}

	const customCommand = sanitizeCommand(compose.command);

	if (customCommand) {
		command = `${command} ${customCommand}`;
	}

	return command;
};

const createEnvFile = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths();
	const { env, composePath, appName } = compose;
	const composeFilePath =
		join(COMPOSE_PATH, appName, "code", composePath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.yml");

	const envFilePath = join(dirname(composeFilePath), ".env");
	let envContent = env || "";
	if (!envContent.includes("DOCKER_CONFIG")) {
		envContent += "\nDOCKER_CONFIG=/root/.docker/config.json";
	}

	if (compose.randomize) {
		envContent += `\nCOMPOSE_PREFIX=${compose.suffix}`;
	}

	const envFileContent = prepareEnvironmentVariables(envContent).join("\n");

	if (!existsSync(dirname(envFilePath))) {
		mkdirSync(dirname(envFilePath), { recursive: true });
	}
	writeFileSync(envFilePath, envFileContent);
};

export const processComposeFile = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths();
	const { env, appName, sourceType, composeType } = compose;

	const inputPath =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	const composeInputFilePath =
		join(COMPOSE_PATH, appName, "code", inputPath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.yml");

	const outputPath = "docker-compose.processed.yml";
	const composeOutputFilePath =
		join(COMPOSE_PATH, appName, "code", outputPath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.processed.yml");

	let templateContent = readFileSync(composeInputFilePath, "utf8");

	if (composeType === "stack") {
		const envContent = prepareEnvironmentVariables(env || "").join("\n");
		const envVariables = dotenv.parse(envContent);

		templateContent = templateContent.replace(
			/\$\{([^}]+)\}/g,
			(_, varName) => {
				return envVariables[varName] || "";
			},
		);
	}

	writeFileSync(composeOutputFilePath, templateContent);
};

export const getProcessComposeFileCommand = (compose: ComposeNested) => {
	const { composeType } = compose;
	if (composeType === "stack") {
		return "set -a; source .env; set +a; envsubst < docker-compose.yml > docker-compose.processed.yml";
	}
	return "cp docker-compose.yml docker-compose.processed.yml";
};

export const getCreateEnvFileCommand = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(true);
	const { env, composePath, appName } = compose;
	const composeFilePath =
		join(COMPOSE_PATH, appName, "code", composePath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.yml");

	const envFilePath = join(dirname(composeFilePath), ".env");

	let envContent = env || "";
	if (!envContent.includes("DOCKER_CONFIG")) {
		envContent += "\nDOCKER_CONFIG=/root/.docker/config.json";
	}

	if (compose.randomize) {
		envContent += `\nCOMPOSE_PREFIX=${compose.suffix}`;
	}

	const envFileContent = prepareEnvironmentVariables(envContent).join("\n");

	const encodedContent = encodeBase64(envFileContent);
	return `
touch ${envFilePath};
echo "${encodedContent}" | base64 -d > "${envFilePath}";
	`;
};
