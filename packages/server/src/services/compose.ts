import { existsSync, promises as fsPromises } from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCompose,
	buildAppName,
	cleanAppName,
	compose,
} from "@dokploy/server/db/schema";
import {
	getBuildComposeCommand,
	getComposeConfigCommand,
	getComposeRemoteBuildCommand,
	getPushImagesCommand,
	getRemoteImageRef,
	resolveBuiltImages,
	sanitizeImageTag,
	type PrebuiltImages,
} from "@dokploy/server/utils/builders/compose";
import { randomizeSpecificationFile } from "@dokploy/server/utils/docker/compose";
import {
	cloneCompose,
	loadDockerCompose,
	loadDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import { getBuildErrorMessage } from "@dokploy/server/utils/notifications/build-error-message";
import { sendBuildSuccessNotifications } from "@dokploy/server/utils/notifications/build-success";
import {
	appendFileRemote,
	execAsync,
	execAsyncRemote,
	readFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import { cloneBitbucketRepository } from "@dokploy/server/utils/providers/bitbucket";
import {
	cloneGitRepository,
	getGitCommitInfo,
} from "@dokploy/server/utils/providers/git";
import { cloneGiteaRepository } from "@dokploy/server/utils/providers/gitea";
import { cloneGithubRepository } from "@dokploy/server/utils/providers/github";
import { cloneGitlabRepository } from "@dokploy/server/utils/providers/gitlab";
import { getCreateComposeFileCommand } from "@dokploy/server/utils/providers/raw";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import { withResolvedVaultRefs } from "@dokploy/server/utils/vault";
import { getDokployUrl } from "./admin";
import {
	createDeploymentCompose,
	updateDeployment,
	updateDeploymentStatus,
	writeDeploymentErrorLog,
} from "./deployment";
import { generateApplyPatchesCommand } from "./patch";
import { validUniqueServerAppName } from "./project";

export type Compose = typeof compose.$inferSelect;

export const createCompose = async (
	input: z.infer<typeof apiCreateCompose>,
) => {
	const appName = buildAppName("compose", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newDestination = await db
		.insert(compose)
		.values({
			...input,
			composeFile: input.composeFile || "",
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	return newDestination;
};

export const createComposeByTemplate = async (
	input: typeof compose.$inferInsert,
) => {
	const appName = cleanAppName(input.appName);
	if (appName) {
		const valid = await validUniqueServerAppName(appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}
	const newDestination = await db
		.insert(compose)
		.values({
			...input,
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	return newDestination;
};

export const findComposeById = async (composeId: string) => {
	const result = await db.query.compose.findFirst({
		where: eq(compose.composeId, composeId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			deployments: true,
			mounts: true,
			domains: true,
			github: {
				columns: {
					githubClientSecret: false,
					githubPrivateKey: false,
					githubWebhookSecret: false,
				},
			},
			gitlab: {
				columns: { secret: false, accessToken: false, refreshToken: false },
			},
			bitbucket: { columns: { appPassword: false, apiToken: false } },
			gitea: {
				columns: {
					clientSecret: false,
					accessToken: false,
					refreshToken: false,
				},
			},
			server: true,
			buildServer: true,
			buildRegistry: { columns: { password: false } },
			backups: {
				with: {
					destination: {
						columns: {
							accessKey: false,
							secretAccessKey: false,
						},
					},
					deployments: true,
				},
			},
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Compose not found",
		});
	}
	return result;
};

export const loadServices = async (
	composeId: string,
	type: "fetch" | "cache" = "fetch",
) => {
	const compose = await findComposeById(composeId);

	if (type === "fetch") {
		const command = await cloneCompose(compose);
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, command);
		} else {
			await execAsync(command);
		}
	}

	let composeData: ComposeSpecification | null;

	if (compose.serverId) {
		composeData = await loadDockerComposeRemote(compose);
	} else {
		composeData = await loadDockerCompose(compose);
	}

	if (compose.randomize && composeData) {
		const randomizedCompose = randomizeSpecificationFile(
			composeData,
			compose.suffix,
		);
		composeData = randomizedCompose;
	}

	if (!composeData?.services) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Services not found",
		});
	}

	const services = Object.keys(composeData.services);

	return [...services];
};

export const updateCompose = async (
	composeId: string,
	composeData: Partial<Compose>,
) => {
	const { appName, ...rest } = composeData;
	const composeResult = await db
		.update(compose)
		.set({
			...rest,
		})
		.where(eq(compose.composeId, composeId))
		.returning();

	return composeResult[0];
};

type ComposeEntity = Awaited<ReturnType<typeof findComposeById>> & {
	type: "compose";
};

const ensureLogDirectory = async (
	serverId: string | null,
	logPath: string,
) => {
	const logDir = dirname(logPath);
	if (serverId) {
		await execAsyncRemote(serverId, `mkdir -p ${quote([logDir])}`);
		return;
	}
	await fsPromises.mkdir(logDir, { recursive: true });
};

const runWithLog = async (
	serverId: string | null,
	command: string,
	logPath: string,
) => {
	await ensureLogDirectory(serverId, logPath);
	const commandWithLog = `(${command}) >> ${quote([logPath])} 2>&1`;
	if (serverId) {
		await execAsyncRemote(serverId, commandWithLog);
	} else {
		await execAsync(commandWithLog);
	}
};

const readFileOnTarget = async (
	serverId: string | null,
	path: string,
): Promise<Buffer | null> => {
	if (serverId) return readFileRemote(serverId, path);
	try {
		return await fsPromises.readFile(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
};

const appendFileOnTarget = (
	serverId: string | null,
	path: string,
	content: string | Buffer,
) =>
	serverId
		? appendFileRemote(serverId, path, content)
		: fsPromises.appendFile(path, content);

export const appendDeployLogsIfSplit = async (
	deployTarget: string | null,
	deployLogPath: string,
	logTarget: string | null,
	mainLogPath: string,
) => {
	if (logTarget === deployTarget) return;

	try {
		const deployLog = await readFileOnTarget(deployTarget, deployLogPath);
		if (deployLog?.toString().trim()) {
			await appendFileOnTarget(
				logTarget,
				mainLogPath,
				Buffer.concat([Buffer.from("\n=== Deploy phase ===\n"), deployLog]),
			);
		}
		const rmCommand = `rm -f ${quote([deployLogPath])}`;
		if (deployTarget) {
			await execAsyncRemote(deployTarget, rmCommand);
		} else {
			await execAsync(rmCommand);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await appendFileOnTarget(
			logTarget,
			mainLogPath,
			`\n⚠️ Could not copy the deploy-phase log (${message}). It is still on the deploy server at ${deployLogPath}.\n`,
		).catch(() => {});
	}
};

const cloneComposeSource = async (
	compose: ComposeEntity,
	serverId: string | null,
) => {
	const entity = { ...compose, serverId, type: "compose" as const };
	let command = "set -e;";
	if (compose.sourceType === "github") {
		command += await cloneGithubRepository(entity);
	} else if (compose.sourceType === "gitlab") {
		command += await cloneGitlabRepository(entity);
	} else if (compose.sourceType === "bitbucket") {
		command += await cloneBitbucketRepository(entity);
	} else if (compose.sourceType === "git") {
		command += await cloneGitRepository(entity);
	} else if (compose.sourceType === "gitea") {
		command += await cloneGiteaRepository(entity);
	} else if (compose.sourceType === "raw") {
		command += getCreateComposeFileCommand(entity);
	}
	return command;
};

const codeExistsOnTarget = async (
	compose: ComposeEntity,
	serverId: string | null,
) => {
	const { COMPOSE_PATH } = paths(!!serverId);
	const codePath = join(COMPOSE_PATH, compose.appName, "code");
	if (!serverId) return existsSync(codePath);
	const { stdout } = await execAsyncRemote(
		serverId,
		`test -d ${quote([codePath])} && echo exists || true`,
	);
	return stdout.trim() === "exists";
};

const prepareSourceOnTarget = async (
	compose: ComposeEntity,
	serverId: string | null,
	logPath: string,
	options?: { reuseExisting?: boolean },
) => {
	const reuse =
		options?.reuseExisting &&
		compose.sourceType !== "raw" &&
		(await codeExistsOnTarget(compose, serverId));
	if (!reuse) {
		const command = await cloneComposeSource(compose, serverId);
		await runWithLog(serverId, command, logPath);
	}

	if (compose.sourceType === "raw") return;
	const patchCommand = await generateApplyPatchesCommand({
		id: compose.composeId,
		type: "compose",
		serverId,
	});
	if (patchCommand) {
		await runWithLog(serverId, `set -e;${patchCommand}`, logPath);
	}
};

const DOCKER_ARCHITECTURES: Record<string, string> = {
	x86_64: "amd64",
	amd64: "amd64",
	aarch64: "arm64",
	arm64: "arm64",
	armv7l: "arm/v7",
};

const getDockerPlatform = async (serverId: string | null) => {
	try {
		const { stdout } = serverId
			? await execAsyncRemote(
					serverId,
					`docker info --format '{{.OSType}} {{.Architecture}}'`,
				)
			: await execAsync(`docker info --format '{{.OSType}} {{.Architecture}}'`);
		const [os, arch] = stdout.trim().split(" ");
		if (!os || !arch) return null;
		return `${os}/${DOCKER_ARCHITECTURES[arch] ?? arch}`;
	} catch {
		return null;
	}
};

const getPrebuiltImageTag = async (
	compose: ComposeEntity,
	buildServerId: string,
	deploymentId: string,
) => {
	if (compose.sourceType !== "raw") {
		const { COMPOSE_PATH } = paths(true);
		const codePath = join(COMPOSE_PATH, compose.appName, "code");
		const { stdout } = await execAsyncRemote(
			buildServerId,
			`git -C ${quote([codePath])} rev-parse --short=12 HEAD 2>/dev/null || true`,
		);
		const sha = stdout.trim();
		if (sha) return sanitizeImageTag(sha);
	}
	return sanitizeImageTag(deploymentId);
};

const buildOnBuildServer = async (
	compose: ComposeEntity,
	{
		buildServerId,
		deployServerId,
		logPath,
		deploymentId,
		reuseExisting,
	}: {
		buildServerId: string;
		deployServerId: string | null;
		logPath: string;
		deploymentId: string;
		reuseExisting: boolean;
	},
): Promise<PrebuiltImages> => {
	if (!compose.buildRegistryId) {
		throw new Error(
			"A build registry is required when a build server is set. Select one under Advanced → Build Server.",
		);
	}
	const registry = await findRegistryByIdWithCredentials(
		compose.buildRegistryId,
	);

	await prepareSourceOnTarget(compose, buildServerId, logPath, {
		reuseExisting,
	});

	const [buildPlatform, deployPlatform] = await Promise.all([
		getDockerPlatform(buildServerId),
		getDockerPlatform(deployServerId),
	]);
	const platform =
		buildPlatform && deployPlatform && buildPlatform !== deployPlatform
			? deployPlatform
			: undefined;
	if (platform) {
		await runWithLog(
			buildServerId,
			`echo ${quote([`⚠️ Build server is ${buildPlatform} but the deploy server is ${deployPlatform}. Building for ${deployPlatform}; this needs QEMU/binfmt on the build server (docker run --privileged --rm tonistiigi/binfmt --install all).`])}`,
			logPath,
		);
	}

	const buildCommand = await getComposeRemoteBuildCommand(
		compose,
		buildServerId,
		registry,
		{ platform },
	);
	if (!buildCommand) {
		await runWithLog(
			buildServerId,
			`echo "ℹ️ No services with build: defined, skipping the remote build"`,
			logPath,
		);
		return { registry, images: {} };
	}
	await runWithLog(buildServerId, buildCommand, logPath);

	const resolved = await withResolvedVaultRefs(compose);
	const { stdout } = await execAsyncRemote(
		buildServerId,
		getComposeConfigCommand(resolved),
	);
	let built: ReturnType<typeof resolveBuiltImages>;
	try {
		built = resolveBuiltImages(stdout);
	} catch {
		throw new Error(
			"Could not read the compose configuration on the build server",
		);
	}

	const tag = await getPrebuiltImageTag(compose, buildServerId, deploymentId);
	const images = built.map(({ service, localImage }) => ({
		service,
		localImage,
		remoteImage: getRemoteImageRef(registry, compose.appName, service, tag),
	}));
	await runWithLog(
		buildServerId,
		getPushImagesCommand(registry, images),
		logPath,
	);

	return {
		registry,
		images: Object.fromEntries(
			images.map(({ service, remoteImage }) => [service, remoteImage]),
		),
	};
};

const runComposeDeployment = async (
	compose: ComposeEntity,
	deployment: { deploymentId: string; logPath: string },
	{
		freshVolumes,
		reuseExisting,
	}: { freshVolumes: boolean; reuseExisting: boolean },
) => {
	const deployTarget = compose.serverId ?? null;
	const logTarget = compose.buildServerId ?? deployTarget;
	const buildTarget =
		compose.buildServerId && compose.buildServerId !== deployTarget
			? compose.buildServerId
			: null;
	const deployLogPath =
		logTarget !== deployTarget
			? `${deployment.logPath}.deploy`
			: deployment.logPath;

	try {
		let prebuilt: PrebuiltImages | undefined;
		if (buildTarget) {
			prebuilt = await buildOnBuildServer(compose, {
				buildServerId: buildTarget,
				deployServerId: deployTarget,
				logPath: deployment.logPath,
				deploymentId: deployment.deploymentId,
				reuseExisting,
			});
			await runWithLog(
				logTarget,
				`echo "🚀 Deploying on the deploy server, its output is added below when it finishes..."`,
				deployment.logPath,
			);
		}

		await prepareSourceOnTarget(compose, deployTarget, deployLogPath, {
			reuseExisting,
		});

		if (freshVolumes && compose.composeType === "docker-compose") {
			const downCommand = `set -e; env -i PATH="$PATH" docker compose -p ${compose.appName} down --volumes 2>&1 || true;`;
			await runWithLog(deployTarget, downCommand, deployLogPath);
		}

		const deployCommand = await getBuildComposeCommand(compose, {
			targetServerId: deployTarget,
			prebuilt,
		});
		await runWithLog(deployTarget, deployCommand, deployLogPath);
	} catch (error) {
		await appendDeployLogsIfSplit(
			deployTarget,
			deployLogPath,
			logTarget,
			deployment.logPath,
		);
		throw error;
	}

	await appendDeployLogsIfSplit(
		deployTarget,
		deployLogPath,
		logTarget,
		deployment.logPath,
	);
};

export const deployCompose = async ({
	composeId,
	titleLog = "Manual deployment",
	descriptionLog = "",
	freshVolumes = false,
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
	freshVolumes?: boolean;
}) => {
	const compose = await findComposeById(composeId);
	const logTarget = compose.buildServerId ?? compose.serverId ?? null;

	const buildLink = `${await getDokployUrl()}/dashboard/project/${
		compose.environment.projectId
	}/environment/${compose.environmentId}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		await runComposeDeployment(
			{ ...compose, type: "compose" },
			deployment,
			{ freshVolumes, reuseExisting: false },
		);

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});

		await sendBuildSuccessNotifications({
			projectName: compose.environment.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			buildLink,
			organizationId: compose.environment.project.organizationId,
			domains: compose.domains,
			environmentName: compose.environment.name,
		});
	} catch (error) {
		const errorMessage = await getBuildErrorMessage(
			error,
			deployment.logPath,
			logTarget,
		);
		await writeDeploymentErrorLog(deployment, logTarget, error);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		await sendBuildErrorNotifications({
			projectName: compose.environment.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			errorMessage,
			buildLink,
			organizationId: compose.environment.project.organizationId,
		});
		throw error;
	} finally {
		if (compose.sourceType !== "raw") {
			const commitInfo = await getGitCommitInfo({
				...compose,
				type: "compose",
			});
			if (commitInfo) {
				await updateDeployment(deployment.deploymentId, {
					title: commitInfo.message,
					description: `Commit: ${commitInfo.hash}`,
				});
			}
		}
	}
};

export const rebuildCompose = async ({
	composeId,
	titleLog = "Rebuild deployment",
	descriptionLog = "",
	freshVolumes = false,
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
	freshVolumes?: boolean;
}) => {
	const compose = await findComposeById(composeId);
	const logTarget = compose.buildServerId ?? compose.serverId ?? null;

	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		await runComposeDeployment(
			{ ...compose, type: "compose" },
			deployment,
			{ freshVolumes, reuseExisting: true },
		);

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		await writeDeploymentErrorLog(deployment, logTarget, error);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		throw error;
	}

	return true;
};

export const removeCompose = async (
	compose: Compose,
	deleteVolumes: boolean,
) => {
	try {
		const { COMPOSE_PATH } = paths(!!compose.serverId);
		const projectPath = join(COMPOSE_PATH, compose.appName);

		if (compose.composeType === "stack") {
			const command = `
			docker network disconnect ${compose.appName} dokploy-traefik;
			docker stack rm ${compose.appName};
			rm -rf ${projectPath}`;

			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
		} else {
			const command = `
			docker network disconnect ${compose.appName} dokploy-traefik;
			env -i PATH="$PATH" docker compose -p ${compose.appName} down ${
				deleteVolumes ? "--volumes" : ""
			};
			rm -rf ${projectPath}`;

			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
		}
	} catch (error) {
		throw error;
	}

	return true;
};

export const startCompose = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	try {
		const { COMPOSE_PATH } = paths(!!compose.serverId);

		const projectPath = join(COMPOSE_PATH, compose.appName, "code");
		const path =
			compose.sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
		const baseCommand = `env -i PATH="$PATH" docker compose -p ${quote([compose.appName])} -f ${quote([path])} up -d`;
		if (compose.composeType === "docker-compose") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`cd ${projectPath} && ${baseCommand}`,
				);
			} else {
				await execAsync(baseCommand, {
					cwd: projectPath,
				});
			}
		}

		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		await updateCompose(composeId, {
			composeStatus: "idle",
		});
		throw error;
	}

	return true;
};

export const stopCompose = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	try {
		const { COMPOSE_PATH } = paths(!!compose.serverId);
		if (compose.composeType === "docker-compose") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`cd ${join(COMPOSE_PATH, compose.appName)} && env -i PATH="$PATH" docker compose -p ${
						compose.appName
					} stop`,
				);
			} else {
				await execAsync(
					`env -i PATH="$PATH" docker compose -p ${compose.appName} stop`,
					{
						cwd: join(COMPOSE_PATH, compose.appName),
					},
				);
			}
		}

		if (compose.composeType === "stack") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`docker stack rm ${compose.appName}`,
				);
			} else {
				await execAsync(`docker stack rm ${compose.appName}`);
			}
		}

		await updateCompose(composeId, {
			composeStatus: "idle",
		});
	} catch (error) {
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		throw error;
	}

	return true;
};
