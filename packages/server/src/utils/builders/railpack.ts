import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
import {
	parseEnvironmentKeyValuePair,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForShell,
} from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import type { ApplicationNested } from ".";
import { planBuildArchitecture, planPlatformArgs } from "./build-platform";
import type { DockerBuildOptions } from "./docker-file";

const calculateSecretsHash = (envVariables: string[]): string => {
	const hash = createHash("sha256");
	for (const env of envVariables.sort()) {
		hash.update(env);
	}
	return hash.digest("hex");
};

export const getRailpackCommand = (
	application: ApplicationNested,
	options: DockerBuildOptions = {},
) => {
	const { env, appName, cleanCache } = application;
	const plan = planBuildArchitecture(application);
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
	const pushTags = options.pushTags ?? [];
	if (plan.kind === "multi" && pushTags.length === 0) {
		throw new Error("Multi-architecture builds require registry tags to push.");
	}
	// Use a unique builder name per build so concurrent deployments don't race
	// on a shared "builder-containerd" instance (create/use/rm collisions).
	const ephemeralBuilder = `railpack-${appName}-${nanoid(6)}`;
	const builderName = plan.builder ?? ephemeralBuilder;
	const ownsEphemeralBuilder = plan.builder === null;
	const quotedBuilder = quote([builderName]);
	const multiArchArgs = pushTags.flatMap((tag) => ["-t", quote([tag])]);
	const buildArgs = [
		"buildx",
		"build",
		"--builder",
		quotedBuilder,
		...planPlatformArgs(plan),
		"--build-arg",
		`secrets-hash=${secretsHash}`,
		...(cacheKey ? ["--build-arg", `cache-key=${cacheKey}`] : []),
		"--build-arg",
		`BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${application.railpackVersion}`,
		"-f",
		`${buildAppDirectory}/railpack-plan.json`,
		...(plan.kind === "multi"
			? [...multiArchArgs, "--push"]
			: ["--output", `type=docker,name=${appName}`]),
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

	const createBuilder = ownsEphemeralBuilder
		? `docker buildx create --name ${quotedBuilder} --driver docker-container || true`
		: "";
	const removeBuilder = ownsEphemeralBuilder
		? `docker buildx rm ${quotedBuilder} || true`
		: "";

	const bashCommand = `

# Ensure we have a builder with containerd (isolated per build)

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
${createBuilder}

echo "Preparing Railpack build plan..." ;
railpack ${prepareArgs.join(" ")} || {
	echo "❌ Railpack prepare failed" ;
	${removeBuilder}
	exit 1;
}
echo "✅ Railpack prepare completed." ;

echo "Building with Railpack frontend..." ;
# Export environment variables for secrets
${exportEnvs.join("\n")}
docker ${buildArgs.join(" ")} || {
	echo "❌ Railpack build failed" ;
	${removeBuilder}
	exit 1;
}
echo "✅ Railpack build completed." ;
${removeBuilder}
`;

	return bashCommand;
};
