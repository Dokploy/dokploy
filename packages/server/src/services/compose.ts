import { promises as fsPromises } from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCompose,
	buildAppName,
	cleanAppName,
	compose,
} from "@dokploy/server/db/schema";
import { getBuildComposeCommand, getComposeRemoteBuildCommand } from "@dokploy/server/utils/builders/compose";
import { randomizeSpecificationFile } from "@dokploy/server/utils/docker/compose";
import {
	cloneCompose,
	loadDockerCompose,
	loadDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import { sendBuildSuccessNotifications } from "@dokploy/server/utils/notifications/build-success";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
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
import { encodeBase64 } from "../utils/docker/utils";
import { getDokployUrl } from "./admin";
import {
	createDeploymentCompose,
	updateDeployment,
	updateDeploymentStatus,
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
			github: true,
			gitlab: true,
			bitbucket: true,
			gitea: true,
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

const appendDeployLogsIfSplit = async (
	deployTarget: string | null,
	deployLogPath: string,
	logTarget: string | null,
	mainLogPath: string,
) => {
	if (logTarget === deployTarget) return;

	await appendLogFromTarget(
		deployTarget,
		deployLogPath,
		logTarget,
		mainLogPath,
		"Deploy phase",
	);
};

const appendLogFromTarget = async (
	fromServerId: string | null,
	fromLogPath: string,
	toServerId: string | null,
	toLogPath: string,
	sectionLabel: string,
) => {
	let content = "";
	if (fromServerId) {
		const result = await execAsyncRemote(
			fromServerId,
			`cat ${quote([fromLogPath])} 2>/dev/null || true`,
		);
		content = result.stdout;
	} else {
		const result = await execAsync(
			`cat ${quote([fromLogPath])} 2>/dev/null || true`,
		);
		content = result.stdout;
	}

	if (!content.trim()) return;

	const section = `\n=== ${sectionLabel} ===\n${content}`;
	const encoded = encodeBase64(section);
	const appendCommand = `echo "${encoded}" | base64 -d >> ${quote([toLogPath])}`;
	if (toServerId) {
		await execAsyncRemote(toServerId, appendCommand);
	} else {
		await execAsync(appendCommand);
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

const applyComposePatches = async (
	compose: ComposeEntity,
	serverId: string | null,
) => {
	if (compose.sourceType === "raw") {
		return "";
	}
	return generateApplyPatchesCommand({
		id: compose.composeId,
		type: "compose",
		serverId,
	});
};

const cloneAndPatchOnTarget = async (
	compose: ComposeEntity,
	targetServerId: string | null,
	logPath: string,
	options?: { skipClone?: boolean },
) => {
	if (!options?.skipClone) {
		const command = await cloneComposeSource(compose, targetServerId);
		await runWithLog(targetServerId, command, logPath);
	}

	const patchCommand = await applyComposePatches(compose, targetServerId);
	if (patchCommand) {
		await runWithLog(targetServerId, `set -e;${patchCommand}`, logPath);
	}
};

export const deployCompose = async ({
	composeId,
	titleLog = "Manual deployment",
	descriptionLog = "",
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const buildTarget = compose.buildServerId ?? null;
	const deployTarget = compose.serverId ?? null;
	const logTarget = buildTarget ?? deployTarget;
	const usesRemoteBuild = Boolean(buildTarget && compose.buildRegistryId);

	const buildLink = `${await getDokployUrl()}/dashboard/project/${
		compose.environment.projectId
	}/environment/${compose.environmentId}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	const entity = {
		...compose,
		type: "compose" as const,
	};

	const logErrorToTarget = async (error: unknown) => {
		let command = "";
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> ${quote([deployment.logPath])};`;
		}
		command += `echo "\nError occurred ❌, check the logs for details." >> ${quote([deployment.logPath])};`;
		if (logTarget) {
			await execAsyncRemote(logTarget, command);
		} else {
			await execAsync(command);
		}
	};

	const deployLogPath =
		logTarget !== deployTarget
			? `${deployment.logPath}.deploy`
			: deployment.logPath;

	try {
		if (usesRemoteBuild && buildTarget) {
			await cloneAndPatchOnTarget(entity, buildTarget, deployment.logPath);
			const buildCommand = await getComposeRemoteBuildCommand(
				entity,
				buildTarget,
			);
			await runWithLog(buildTarget, buildCommand, deployment.logPath);
		}

		if (usesRemoteBuild && deployTarget !== buildTarget) {
			await cloneAndPatchOnTarget(entity, deployTarget, deployLogPath);
		} else if (!usesRemoteBuild) {
			await cloneAndPatchOnTarget(entity, deployTarget, deployment.logPath);
		}

		const deployCommand = await getBuildComposeCommand(entity, {
			prebuilt: usesRemoteBuild,
			targetServerId: deployTarget,
		});
		await runWithLog(deployTarget, deployCommand, deployLogPath);

		await appendDeployLogsIfSplit(
			deployTarget,
			deployLogPath,
			logTarget,
			deployment.logPath,
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
		try {
			await appendDeployLogsIfSplit(
				deployTarget,
				deployLogPath,
				logTarget,
				deployment.logPath,
			);
		} catch {
			// Best effort: deploy logs may not exist yet.
		}
		await logErrorToTarget(error);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		await sendBuildErrorNotifications({
			projectName: compose.environment.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			// @ts-ignore
			errorMessage: error?.message || "Error building",
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
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const buildTarget = compose.buildServerId ?? null;
	const deployTarget = compose.serverId ?? null;
	const logTarget = buildTarget ?? deployTarget;
	const usesRemoteBuild = Boolean(buildTarget && compose.buildRegistryId);

	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	const entity = {
		...compose,
		type: "compose" as const,
	};

	const deployLogPath =
		logTarget !== deployTarget
			? `${deployment.logPath}.deploy`
			: deployment.logPath;

	try {
		if (usesRemoteBuild && buildTarget) {
			if (compose.sourceType === "raw") {
				const rawCommand = getCreateComposeFileCommand(entity);
				await runWithLog(buildTarget, rawCommand, deployment.logPath);
			}
			await cloneAndPatchOnTarget(entity, buildTarget, deployment.logPath, {
				skipClone: true,
			});
			const buildCommand = await getComposeRemoteBuildCommand(
				entity,
				buildTarget,
			);
			await runWithLog(buildTarget, buildCommand, deployment.logPath);
		}

		if (usesRemoteBuild && deployTarget !== buildTarget) {
			if (compose.sourceType === "raw") {
				const rawCommand = getCreateComposeFileCommand(entity);
				await runWithLog(deployTarget, rawCommand, deployLogPath);
			}
			await cloneAndPatchOnTarget(entity, deployTarget, deployLogPath, {
				skipClone: true,
			});
		} else if (!usesRemoteBuild) {
			if (compose.sourceType === "raw") {
				const rawCommand = getCreateComposeFileCommand(entity);
				await runWithLog(deployTarget, rawCommand, deployment.logPath);
			}
			await cloneAndPatchOnTarget(entity, deployTarget, deployment.logPath, {
				skipClone: true,
			});
		}

		const deployCommand = await getBuildComposeCommand(entity, {
			prebuilt: usesRemoteBuild,
			targetServerId: deployTarget,
		});
		await runWithLog(deployTarget, deployCommand, deployLogPath);

		await appendDeployLogsIfSplit(
			deployTarget,
			deployLogPath,
			logTarget,
			deployment.logPath,
		);

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		try {
			await appendDeployLogsIfSplit(
				deployTarget,
				deployLogPath,
				logTarget,
				deployment.logPath,
			);
		} catch {
			// Best effort: deploy logs may not exist yet.
		}

		let command = "";

		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> ${quote([deployment.logPath])};`;
		}

		command += `echo "\nError occurred ❌, check the logs for details." >> ${quote([deployment.logPath])};`;
		if (logTarget) {
			await execAsyncRemote(logTarget, command);
		} else {
			await execAsync(command);
		}
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
