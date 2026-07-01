import { dirname, join } from "node:path";
import { encodeBase64, prepareEnvironmentVariables } from "../docker/utils";
import { quoteShellArgument } from "../shell";

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

	const encodedContent = encodeBase64(envFileContent || "");
	const envFilePath = join(dirname(directory), ".env");
	const quotedEnvFilePath = quoteShellArgument(envFilePath);

	return `echo "${encodedContent}" | base64 -d > ${quotedEnvFilePath};`;
};
