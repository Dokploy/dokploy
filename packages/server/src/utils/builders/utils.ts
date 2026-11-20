import { dirname, join } from "node:path";
import { encodeBase64, prepareEnvironmentVariables } from "../docker/utils";

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

	// The file holds the app's secrets: restrict it to its owner before any
	// content is written, so it is never readable by other users on the host.
	// Bail out if the permissions cannot be set, rather than writing the secret
	// into a file that may still be readable by others.
	return `touch "${envFilePath}" && chmod 600 "${envFilePath}" || exit 1; echo "${encodedContent}" | base64 -d > "${envFilePath}";`;
};
