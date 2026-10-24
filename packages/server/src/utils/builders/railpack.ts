import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
import {
	getRailpackBuilderName,
	parseEnvironmentKeyValuePair,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForShell,
} from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ApplicationNested } from ".";

const calculateSecretsHash = (envVariables: string[]): string => {
	const hash = createHash("sha256");
	for (const env of envVariables.sort()) {
		hash.update(env);
	}
	return hash.digest("hex");
};

export const getRailpackCommand = (application: ApplicationNested) => {
	const { env, appName, cleanCache } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariablesForShell(
		env,
		application.environment.project.env,
		application.environment.env,
	);

	// Prepare command
	const prepareArgs = [
		"prepare",
		buildAppDirectory,
		"--plan-out",
		`${buildAppDirectory}/railpack-plan.json`,
		"--info-out",
		`${buildAppDirectory}/railpack-info.json`,
	];

	for (const env of envVariables) {
		prepareArgs.push("--env", env);
	}

	// Calculate secrets hash for layer invalidation
	const secretsHash = calculateSecretsHash(envVariables);

	const cacheKey = cleanCache ? nanoid(10) : undefined;
	// Build command.
	const builderName = quote([getRailpackBuilderName(appName)]);
	const clearBuildCache = cleanCache
		? `docker buildx prune --builder ${builderName} --all --force || {
	echo "❌ Deleting the Railpack build cache failed" ;
	exit 1;
}`
		: "";
	const buildArgs = [
		"buildx",
		"build",
		"--builder",
		builderName,
		...(cleanCache ? ["--no-cache"] : []),
		"--build-arg",
		`secrets-hash=${secretsHash}`,
		...(cacheKey ? ["--build-arg", `cache-key=${cacheKey}`] : []),
		"--build-arg",
		`BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${application.railpackVersion}`,
		"-f",
		`${buildAppDirectory}/railpack-plan.json`,
		"--output",
		`type=docker,name=${appName}`,
	];

	// Add secrets properly formatted
	// Use prepareEnvironmentVariables (without ForShell) to get raw values for parsing
	const rawEnvVariables = prepareEnvironmentVariables(
		env,
		application.environment.project.env,
		application.environment.env,
	);
	const exportEnvs = [];
	for (const pair of rawEnvVariables) {
		const [key, value] = parseEnvironmentKeyValuePair(pair);
		if (key && value) {
			buildArgs.push("--secret", `id=${key},env=${key}`);
			exportEnvs.push(`export ${key}=${quote([value])}`);
		}
	}

	buildArgs.push(buildAppDirectory);

	const bashCommand = `

export RAILPACK_VERSION=${application.railpackVersion}
# use sudo for non-root so the install can write to /usr/local/bin
if [ "$(id -u)" -eq 0 ]; then
	SUDO_CMD=""
elif sudo -n true 2>/dev/null; then
	SUDO_CMD="sudo"
else
	SUDO_CMD=""
fi
$SUDO_CMD bash -c "$(curl -fsSL https://railpack.com/install.sh)"
if ! docker buildx inspect ${builderName} >/dev/null 2>&1; then
	docker buildx create --name ${builderName} --driver docker-container || docker buildx inspect ${builderName} >/dev/null 2>&1 || {
		echo "❌ Railpack builder creation failed" ;
		exit 1;
	}
fi
docker buildx inspect --bootstrap ${builderName} >/dev/null || {
	echo "❌ Railpack builder failed to start" ;
	exit 1;
}
${clearBuildCache}

echo "Preparing Railpack build plan..." ;
railpack ${prepareArgs.join(" ")} || {
	echo "❌ Railpack prepare failed" ;
	exit 1;
}
echo "✅ Railpack prepare completed." ;

echo "Building with Railpack frontend..." ;
# Export environment variables for secrets
${exportEnvs.join("\n")}
docker ${buildArgs.join(" ")} || {
	echo "❌ Railpack build failed" ;
	exit 1;
}
echo "✅ Railpack build completed." ;
`;

	return bashCommand;
};
