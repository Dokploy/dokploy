import { dirname, join } from "node:path";
import { prepareEnvironmentVariables } from "../docker/utils";
import { createSecretTempFile } from "../process/secrets";

export const createEnvFileCommand = (
	directory: string,
	env: string | null,
	projectEnv?: string | null,
	environmentEnv?: string | null,
) => {
	const envFileContent = prepareEnvironmentVariables(
		env,
		projectEnv,
		environmentEnv,
	).join("\n");

	const envFilePath = join(dirname(directory), ".env");
	const secret = createSecretTempFile("dokploy-env-", "env", envFileContent);

	return `install -m 600 ${secret.quotedPath} "${envFilePath}"; rm -rf ${secret.quotedDir};`;
};
