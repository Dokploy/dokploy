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

	return `echo "${encodedContent}" | base64 -d > "${envFilePath}";`;
};

/**
 * Returns shell commands to extract git commit hash and message
 * into DOKPLOY_COMMIT_HASH and DOKPLOY_COMMIT_MESSAGE shell variables.
 */
export const getGitCommitInfoCommands = () => {
	return `DOKPLOY_COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DOKPLOY_COMMIT_HASH_LONG=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
DOKPLOY_COMMIT_MESSAGE=$(git log -1 --pretty=%s 2>/dev/null || echo "unknown")`;
};

/**
 * Returns docker --build-arg flags for commit info.
 */
export const getCommitInfoBuildArgs = () => {
	return '--build-arg DOKPLOY_COMMIT_HASH="$DOKPLOY_COMMIT_HASH" --build-arg DOKPLOY_COMMIT_HASH_LONG="$DOKPLOY_COMMIT_HASH_LONG" --build-arg DOKPLOY_COMMIT_MESSAGE="$DOKPLOY_COMMIT_MESSAGE"';
};

/**
 * Returns --env flags for commit info (for pack/nixpacks builders).
 */
export const getCommitInfoEnvArgs = () => {
	return '--env DOKPLOY_COMMIT_HASH="$DOKPLOY_COMMIT_HASH" --env DOKPLOY_COMMIT_HASH_LONG="$DOKPLOY_COMMIT_HASH_LONG" --env DOKPLOY_COMMIT_MESSAGE="$DOKPLOY_COMMIT_MESSAGE"';
};
