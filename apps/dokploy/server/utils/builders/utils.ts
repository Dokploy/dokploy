import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prepareEnvironmentVariables } from "../docker/utils";

export const createEnvFile = (directory: string, env: string | null) => {
	const envFilePath = join(dirname(directory), ".env");
	if (!existsSync(dirname(envFilePath))) {
		mkdirSync(dirname(envFilePath), { recursive: true });
	}
	const envFileContent = prepareEnvironmentVariables(env).join("\n");
	writeFileSync(envFilePath, envFileContent);
};

export const createEnvFileCommand = (directory: string, env: string | null) => {
	const envFilePath = join(dirname(directory), ".env");
	// let command = ``
	if (!existsSync(dirname(envFilePath))) {
		mkdirSync(dirname(envFilePath), { recursive: true });
	}
	const envFileContent = prepareEnvironmentVariables(env).join("\n");
	return `echo "${envFileContent}" > ${envFilePath}`;
};
