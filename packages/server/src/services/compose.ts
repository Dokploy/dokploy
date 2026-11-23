import { join } from "node:path";
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
	getDeployedComposeConfigCommand,
	getStartComposeCommand,
	getStartStackCommand,
	parseDeployedComposeConfig,
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
import type { ServiceInspectInfo } from "../utils/docker/swarm-service";
import { getDokployUrl } from "./admin";
import {
	createDeploymentCompose,
	updateDeployment,
	updateDeploymentStatus,
	writeDeploymentErrorLog,
} from "./deployment";
import { generateApplyPatchesCommand } from "./patch";
import { validUniqueServerAppName } from "./project";
import { findComposeReplicaOverrides } from "./scaling/compose-overrides";
import {
	composeSnapshotArgs,
	readComposeSnapshot,
	runDockerCli,
	writeSnapshotReplicas,
} from "./scaling/compose-snapshot";
import { invalidateComposeScalingStatus } from "./scaling/compose-status";
import { scaleService } from "./scaling/scale-service";
import { getScalingDocker } from "./scaling/status";

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

	const buildLink = `${await getDokployUrl()}/dashboard/project/${
		compose.environment.projectId
	}/environment/${compose.environmentId}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		const entity = {
			...compose,
			type: "compose" as const,
		};
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

		let commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
		if (compose.sourceType !== "raw") {
			command = "set -e;";
			command += await generateApplyPatchesCommand({
				id: compose.composeId,
				type: "compose",
				serverId: compose.serverId,
			});
			commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, commandWithLog);
			} else {
				await execAsync(commandWithLog);
			}
		}

		if (freshVolumes && compose.composeType === "docker-compose") {
			const downCommand = `set -e; env -i PATH="$PATH" docker compose -p ${compose.appName} down --volumes 2>&1 || true;`;
			const downWithLog = `(${downCommand}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, downWithLog);
			} else {
				await execAsync(downWithLog);
			}
		}

		command = "set -e;";
		command += await getBuildComposeCommand(
			entity,
			await findComposeReplicaOverrides(composeId),
		);
		commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

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
			compose.serverId,
		);
		await writeDeploymentErrorLog(deployment, compose.serverId, error);
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

	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		let command = "set -e;";
		if (compose.sourceType === "raw") {
			command += getCreateComposeFileCommand(compose);
		}

		let commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

		if (compose.sourceType !== "raw") {
			command = "set -e;";
			command += await generateApplyPatchesCommand({
				id: compose.composeId,
				type: "compose",
				serverId: compose.serverId,
			});
			commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, commandWithLog);
			} else {
				await execAsync(commandWithLog);
			}
		}

		if (freshVolumes && compose.composeType === "docker-compose") {
			const downCommand = `set -e; env -i PATH="$PATH" docker compose -p ${compose.appName} down --volumes 2>&1 || true;`;
			const downWithLog = `(${downCommand}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, downWithLog);
			} else {
				await execAsync(downWithLog);
			}
		}

		command = "set -e;";
		command += await getBuildComposeCommand(
			compose,
			await findComposeReplicaOverrides(composeId),
		);
		commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		await writeDeploymentErrorLog(deployment, compose.serverId, error);
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
		if (compose.composeType === "stack") {
			const snapshot = await readComposeSnapshot(compose);
			if (snapshot?.composeType !== "stack") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"This stack has no saved deployment to start from: it was not deployed as a stack by this version of Dokploy, or uses a custom command. Deploy it instead.",
				});
			}
			const command = await getStartStackCommand(
				compose,
				snapshot.files.compose,
			);
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
			await updateCompose(composeId, { composeStatus: "done" });
			return true;
		}
		const snapshot =
			compose.composeType === "docker-compose"
				? await readComposeSnapshot(compose)
				: null;
		// The snapshot holds the converted file and env of the last successful
		// deploy, including replica changes made since; the copy in code/ may
		// have been re-cloned raw by a preview.
		if (snapshot) {
			await runDockerCli(compose, snapshot, [
				...composeSnapshotArgs(compose, snapshot),
				"up",
				"-d",
			]);
			await updateCompose(composeId, {
				composeStatus: "done",
			});
			return true;
		}
		if (compose.composeType === "docker-compose") {
			const run = (command: string) =>
				compose.serverId
					? execAsyncRemote(compose.serverId, command)
					: execAsync(command);
			const { stdout } = await run(
				getDeployedComposeConfigCommand(compose.appName),
			);
			await run(
				getStartComposeCommand(compose, parseDeployedComposeConfig(stdout)),
			);
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
		if (compose.composeType === "docker-compose") {
			const snapshot = await readComposeSnapshot(compose);
			if (snapshot) {
				await runDockerCli(compose, snapshot, [
					...composeSnapshotArgs(compose, snapshot),
					"stop",
				]);
			} else {
				const { COMPOSE_PATH } = paths(!!compose.serverId);
				const projectPath = join(COMPOSE_PATH, compose.appName, "code");
				const path =
					compose.sourceType === "raw"
						? "docker-compose.yml"
						: compose.composePath;
				const baseCommand = `env -i PATH="$PATH" docker compose -p ${quote([compose.appName])} -f ${quote([path])} stop`;
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
		}

		if (compose.composeType === "stack") {
			try {
				const docker = await getScalingDocker(compose);
				const listStackServices = async () =>
					(await docker.listServices({
						filters: JSON.stringify({
							label: [`com.docker.stack.namespace=${compose.appName}`],
						}),
					})) as ServiceInspectInfo[];
				const services = await listStackServices();
				const replicatedServices = services.filter(
					(s) => s.Spec?.Mode?.Replicated !== undefined,
				);
				// Scaling and autoscaling change the live count without touching
				// the snapshot, so Start would otherwise redeploy the deployed count.
				const snapshot = await readComposeSnapshot(compose);
				if (snapshot) {
					const prefix = `${compose.appName}_`;
					for (const service of replicatedServices) {
						const live = service.Spec?.Mode?.Replicated?.Replicas ?? 0;
						const name = service.Spec?.Name;
						if (live > 0 && name?.startsWith(prefix)) {
							await writeSnapshotReplicas(
								compose,
								snapshot,
								name.slice(prefix.length),
								live,
							).catch((err) =>
								console.error(`Failed to save replicas of ${name}:`, err),
							);
						}
					}
				}
				await Promise.all(
					replicatedServices.map((service) =>
						scaleService({
							docker,
							serviceName: service.Spec?.Name || service.ID,
							replicas: 0,
							// Stop is explicit; a paused rollout must not keep tasks running.
							allowDuringRollout: true,
						}),
					),
				);
				const stillScaledUp = (await listStackServices()).filter(
					(service) => (service.Spec?.Mode?.Replicated?.Replicas ?? 0) > 0,
				);
				if (stillScaledUp.length > 0) {
					throw new Error(
						`Still scaled up: ${stillScaledUp.map((s) => s.Spec?.Name).join(", ")}`,
					);
				}
			} catch (error) {
				console.error(
					`Scaling stack ${compose.appName} to 0 through the API failed, falling back to the CLI:`,
					error,
				);
				const scaleCommand = `services=$(docker service ls --filter "label=com.docker.stack.namespace=${compose.appName}" --filter "mode=replicated" --format '{{.Name}}=0')\nif [ -n "$services" ]; then\n  docker service scale -d $services\nfi`;
				if (compose.serverId) {
					await execAsyncRemote(compose.serverId, scaleCommand);
				} else {
					await execAsync(scaleCommand);
				}
			}
		}

		invalidateComposeScalingStatus(composeId);
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
