import { createHash } from "node:crypto";
import type { WriteStream } from "node:fs";
import { nanoid } from "nanoid";
import {
	parseEnvironmentKeyValuePair,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import { execAsync } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";
import type { ApplicationNested } from ".";

const calculateSecretsHash = (envVariables: string[]): string => {
	const hash = createHash("sha256");
	for (const env of envVariables.sort()) {
		hash.update(env);
	}
	return hash.digest("hex");
};

export const buildRailpack = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { env, appName, cleanCache } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.project.env,
	);

	try {
		await execAsync(
			"docker buildx create --use --name builder-containerd --driver docker-container || true",
		);

		await execAsync("docker buildx use builder-containerd");

		// First prepare the build plan and info
		const prepareArgs = [
			"prepare",
			buildAppDirectory,
			"--plan-out",
			`${buildAppDirectory}/railpack-plan.json`,
			"--info-out",
			`${buildAppDirectory}/railpack-info.json`,
		];

		// Add environment variables to prepare command
		for (const env of envVariables) {
			prepareArgs.push("--env", env);
		}

		// Run prepare command
		await spawnAsync("railpack", prepareArgs, (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});

		// Calculate secrets hash for layer invalidation
		const secretsHash = calculateSecretsHash(envVariables);

		// Build with BuildKit using the Railpack frontend
		const cacheKey = cleanCache ? nanoid(10) : undefined;
		const buildArgs = [
			"buildx",
			"build",
			...(cacheKey
				? [
						"--build-arg",
						`secrets-hash=${secretsHash}`,
						"--build-arg",
						`cache-key=${cacheKey}`,
					]
				: []),
			"--build-arg",
			`BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${application.railpackVersion}`,
			"-f",
			`${buildAppDirectory}/railpack-plan.json`,
			"--output",
			`type=docker,name=${appName}`,
		];

		// Add secrets properly formatted
		const env: { [key: string]: string } = {};
		for (const pair of envVariables) {
			const [key, value] = parseEnvironmentKeyValuePair(pair);
			if (key && value) {
				buildArgs.push("--secret", `id=${key},env=${key}`);
				env[key] = value;
			}
		}

		buildArgs.push(buildAppDirectory);

		await spawnAsync(
			"docker",
			buildArgs,
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
			{
				env: { ...process.env, ...env },
			},
		);

		return true;
	} catch (e) {
		throw e;
	} finally {
		await execAsync("docker buildx rm builder-containerd");
	}
};

export const getRailpackCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const { env, appName, cleanCache } = application;
	const buildAppDirectory = getBuildAppDirectory(application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.project.env,
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
		prepareArgs.push("--env", `'${env}'`);
	}

	// Calculate secrets hash for layer invalidation
	const secretsHash = calculateSecretsHash(envVariables);

	const cacheKey = cleanCache ? nanoid(10) : undefined;
	// Build command
	const buildArgs = [
		"buildx",
		"build",
		...(cacheKey
			? [
					"--build-arg",
					`secrets-hash=${secretsHash}`,
					"--build-arg",
					`cache-key=${cacheKey}`,
				]
			: []),
		"--build-arg",
		`BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${application.railpackVersion}`,
		"-f",
		`${buildAppDirectory}/railpack-plan.json`,
		"--output",
		`type=docker,name=${appName}`,
	];

	// Add secrets properly formatted
	const exportEnvs = [];
	for (const pair of envVariables) {
		const [key, value] = parseEnvironmentKeyValuePair(pair);
		if (key && value) {
			buildArgs.push("--secret", `id=${key},env=${key}`);
			exportEnvs.push(`export ${key}='${value}'`);
		}
	}

	buildArgs.push(buildAppDirectory);

	const bashCommand = `
# Ensure we have a builder with containerd
docker buildx create --use --name builder-containerd --driver docker-container || true
docker buildx use builder-containerd

echo "Preparing Railpack build plan..." >> "${logPath}";
railpack ${prepareArgs.join(" ")} >> ${logPath} 2>> ${logPath} || { 
	echo "❌ Railpack prepare failed" >> ${logPath};
	exit 1;
}
echo "✅ Railpack prepare completed." >> ${logPath};

echo "Building with Railpack frontend..." >> "${logPath}";
# Export environment variables for secrets
${exportEnvs.join("\n")}
docker ${buildArgs.join(" ")} >> ${logPath} 2>> ${logPath} || { 
	echo "❌ Railpack build failed" >> ${logPath};
	exit 1;
}
echo "✅ Railpack build completed." >> ${logPath};
docker buildx rm builder-containerd
`;

	return bashCommand;
};
