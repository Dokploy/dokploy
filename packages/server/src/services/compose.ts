import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { type apiCreateCompose, compose } from "@dokploy/server/db/schema";
import { buildAppName, cleanAppName } from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates/utils";
import {
	buildCompose,
	getBuildComposeCommand,
} from "@dokploy/server/utils/builders/compose";
import { randomizeSpecificationFile } from "@dokploy/server/utils/docker/compose";
import {
	cloneCompose,
	cloneComposeRemote,
	loadDockerCompose,
	loadDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import { sendBuildSuccessNotifications } from "@dokploy/server/utils/notifications/build-success";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import {
	cloneBitbucketRepository,
	getBitbucketCloneCommand,
} from "@dokploy/server/utils/providers/bitbucket";
import {
	cloneGitRepository,
	getCustomGitCloneCommand,
} from "@dokploy/server/utils/providers/git";
import {
	cloneGithubRepository,
	getGithubCloneCommand,
} from "@dokploy/server/utils/providers/github";
import {
	cloneGitlabRepository,
	getGitlabCloneCommand,
} from "@dokploy/server/utils/providers/gitlab";
import {
	createComposeFile,
	getCreateComposeFileCommand,
} from "@dokploy/server/utils/providers/raw";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { encodeBase64 } from "../utils/docker/utils";
import { getDokployUrl } from "./admin";
import { createDeploymentCompose, updateDeploymentStatus } from "./deployment";
import { validUniqueServerAppName } from "./project";

export type Compose = typeof compose.$inferSelect;

export const createCompose = async (input: typeof apiCreateCompose._type) => {
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
			composeFile: "",
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
			project: true,
			deployments: true,
			mounts: true,
			domains: true,
			github: true,
			gitlab: true,
			bitbucket: true,
			server: true,
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
		if (compose.serverId) {
			await cloneComposeRemote(compose);
		} else {
			await cloneCompose(compose);
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
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const buildLink = `${await getDokployUrl()}/dashboard/project/${
		compose.projectId
	}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		if (compose.sourceType === "github") {
			await cloneGithubRepository({
				...compose,
				logPath: deployment.logPath,
				type: "compose",
			});
		} else if (compose.sourceType === "gitlab") {
			await cloneGitlabRepository(compose, deployment.logPath, true);
		} else if (compose.sourceType === "bitbucket") {
			await cloneBitbucketRepository(compose, deployment.logPath, true);
		} else if (compose.sourceType === "git") {
			await cloneGitRepository(compose, deployment.logPath, true);
		} else if (compose.sourceType === "raw") {
			await createComposeFile(compose, deployment.logPath);
		}
		await buildCompose(compose, deployment.logPath);
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});

		await sendBuildSuccessNotifications({
			projectName: compose.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			buildLink,
			adminId: compose.project.adminId,
		});
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		await sendBuildErrorNotifications({
			projectName: compose.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			// @ts-ignore
			errorMessage: error?.message || "Error building",
			buildLink,
			adminId: compose.project.adminId,
		});
		throw error;
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
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		if (compose.serverId) {
			await getBuildComposeCommand(compose, deployment.logPath);
		} else {
			await buildCompose(compose, deployment.logPath);
		}

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		throw error;
	}

	return true;
};

export const deployRemoteCompose = async ({
	composeId,
	titleLog = "Manual deployment",
	descriptionLog = "",
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const buildLink = `${await getDokployUrl()}/dashboard/project/${
		compose.projectId
	}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});
	try {
		if (compose.serverId) {
			let command = "set -e;";

			if (compose.sourceType === "github") {
				command += await getGithubCloneCommand({
					...compose,
					logPath: deployment.logPath,
					type: "compose",
					serverId: compose.serverId,
				});
			} else if (compose.sourceType === "gitlab") {
				command += await getGitlabCloneCommand(
					compose,
					deployment.logPath,
					true,
				);
			} else if (compose.sourceType === "bitbucket") {
				command += await getBitbucketCloneCommand(
					compose,
					deployment.logPath,
					true,
				);
			} else if (compose.sourceType === "git") {
				command += await getCustomGitCloneCommand(
					compose,
					deployment.logPath,
					true,
				);
			} else if (compose.sourceType === "raw") {
				command += getCreateComposeFileCommand(compose, deployment.logPath);
			}

			await execAsyncRemote(compose.serverId, command);
			await getBuildComposeCommand(compose, deployment.logPath);
		}

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});

		await sendBuildSuccessNotifications({
			projectName: compose.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			buildLink,
			adminId: compose.project.adminId,
		});
	} catch (error) {
		// @ts-ignore
		const encodedContent = encodeBase64(error?.message);

		await execAsyncRemote(
			compose.serverId,
			`
			echo "\n\n===================================EXTRA LOGS============================================" >> ${deployment.logPath};
			echo "Error occurred ❌, check the logs for details." >> ${deployment.logPath};
			echo "${encodedContent}" | base64 -d >> "${deployment.logPath}";`,
		);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		await sendBuildErrorNotifications({
			projectName: compose.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			// @ts-ignore
			errorMessage: error?.message || "Error building",
			buildLink,
			adminId: compose.project.adminId,
		});
		throw error;
	}
};

export const rebuildRemoteCompose = async ({
	composeId,
	titleLog = "Rebuild deployment",
	descriptionLog = "",
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const compose = await findComposeById(composeId);
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		if (compose.serverId) {
			await getBuildComposeCommand(compose, deployment.logPath);
		}

		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		// @ts-ignore
		const encodedContent = encodeBase64(error?.message);

		await execAsyncRemote(
			compose.serverId,
			`
			echo "\n\n===================================EXTRA LOGS============================================" >> ${deployment.logPath};
			echo "Error occurred ❌, check the logs for details." >> ${deployment.logPath};
			echo "${encodedContent}" | base64 -d >> "${deployment.logPath}";`,
		);
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
			const command = `cd ${projectPath} && docker stack rm ${compose.appName} && rm -rf ${projectPath}`;

			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
			await execAsync(command, {
				cwd: projectPath,
			});
		} else {
			let command: string;
			if (deleteVolumes) {
				command = `cd ${projectPath} && docker compose -p ${compose.appName} down --volumes && rm -rf ${projectPath}`;
			} else {
				command = `cd ${projectPath} && docker compose -p ${compose.appName} down && rm -rf ${projectPath}`;
			}

			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command, {
					cwd: projectPath,
				});
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
		if (compose.composeType === "docker-compose") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`cd ${join(
						COMPOSE_PATH,
						compose.appName,
						"code",
					)} && docker compose -p ${compose.appName} up -d`,
				);
			} else {
				await execAsync(`docker compose -p ${compose.appName} up -d`, {
					cwd: join(COMPOSE_PATH, compose.appName, "code"),
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
					`cd ${join(COMPOSE_PATH, compose.appName)} && docker compose -p ${
						compose.appName
					} stop`,
				);
			} else {
				await execAsync(`docker compose -p ${compose.appName} stop`, {
					cwd: join(COMPOSE_PATH, compose.appName),
				});
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
