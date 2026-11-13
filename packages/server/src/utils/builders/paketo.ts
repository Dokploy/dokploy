import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ContentStaging } from "../filesystem/write-content";
import type { ApplicationNested } from ".";
import { stagePackEnvironment } from "./utils";

export const getPaketoCommand = async (
	application: ApplicationNested,
	staging: ContentStaging,
) => {
	const { env, appName, cleanCache } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariables(
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

	const transport = await stagePackEnvironment(staging, envVariables);
	args.push(...transport.args);

	const command = `${transport.prefix} pack ${args.join(" ")}`;
	const bashCommand = `
echo "Starting Paketo build..." ;
${command} || { 
  echo "❌ Paketo build failed" ;
  exit 1;
}
echo "✅ Paketo build completed." ;
		`;

	return bashCommand;
};
