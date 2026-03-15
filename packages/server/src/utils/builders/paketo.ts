import { prepareEnvironmentVariablesForShell } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ApplicationNested } from ".";
import { getGitCommitInfoCommands } from "./utils";

export const getPaketoCommand = (application: ApplicationNested) => {
	const { env, appName, cleanCache } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariablesForShell(
		env,
		application.environment.project.env,
		application.environment.env,
	);

	const args = [
		"build",
		appName,
		"--path",
		buildAppDirectory,
		"--builder",
		"paketobuildpacks/builder-jammy-full",
	];

	if (cleanCache) {
		args.push("--clear-cache");
	}

	for (const env of envVariables) {
		args.push("--env", env);
	}

	const command = `pack ${args.join(" ")}`;
	const bashCommand = `
${getGitCommitInfoCommands()}
echo "Starting Paketo build..." ;
${command} --env DOKPLOY_COMMIT_HASH="$DOKPLOY_COMMIT_HASH" --env DOKPLOY_COMMIT_MESSAGE="$DOKPLOY_COMMIT_MESSAGE" || {
  echo "❌ Paketo build failed" ;
  exit 1;
}
echo "✅ Paketo build completed." ;
		`;

	return bashCommand;
};
