import { existsSync, promises as fsPromises } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateDeployment,
	type apiCreateDeploymentCompose,
	type apiCreateDeploymentPreview,
	type apiCreateDeploymentServer,
	deployments,
} from "@dokploy/server/db/schema";
import { removeDirectoryIfExistsContent } from "@dokploy/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { format } from "date-fns";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
	type Application,
	findApplicationById,
	updateApplicationStatus,
} from "./application";
import { type Compose, findComposeById, updateCompose } from "./compose";
import { type Server, findServerById } from "./server";

import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import {
	type PreviewDeployment,
	findPreviewDeploymentById,
	updatePreviewDeployment,
} from "./preview-deployment";

export type Deployment = typeof deployments.$inferSelect;

export const findDeploymentById = async (applicationId: string) => {
	const application = await db.query.deployments.findFirst({
		where: eq(deployments.applicationId, applicationId),
		with: {
			application: true,
		},
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Deployment not found",
		});
	}
	return application;
};

export const createDeployment = async (
	deployment: Omit<
		typeof apiCreateDeployment._type,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	const application = await findApplicationById(deployment.applicationId);

	try {
		await removeLastTenDeployments(
			deployment.applicationId,
			application.serverId,
		);
		const { LOGS_PATH } = paths(!!application.serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${application.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, application.appName, fileName);

		if (application.serverId) {
			const server = await findServerById(application.serverId);

			const command = `
				mkdir -p ${LOGS_PATH}/${application.appName};
            	echo "Initializing deployment" >> ${logFilePath};
			`;

			await execAsyncRemote(server.serverId, command);
		} else {
			await fsPromises.mkdir(path.join(LOGS_PATH, application.appName), {
				recursive: true,
			});
			await fsPromises.writeFile(logFilePath, "Initializing deployment");
		}

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				applicationId: deployment.applicationId,
				title: deployment.title || "Deployment",
				status: "running",
				logPath: logFilePath,
				description: deployment.description || "",
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await updateApplicationStatus(application.applicationId, "error");
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create the deployment",
		});
	}
};

export const createDeploymentPreview = async (
	deployment: Omit<
		typeof apiCreateDeploymentPreview._type,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	const previewDeployment = await findPreviewDeploymentById(
		deployment.previewDeploymentId,
	);
	try {
		await removeLastTenPreviewDeploymenById(
			deployment.previewDeploymentId,
			previewDeployment?.application?.serverId,
		);

		const appName = `${previewDeployment.appName}`;
		const { LOGS_PATH } = paths(!!previewDeployment?.application?.serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, appName, fileName);

		if (previewDeployment?.application?.serverId) {
			const server = await findServerById(
				previewDeployment?.application?.serverId,
			);

			const command = `
				mkdir -p ${LOGS_PATH}/${appName};
            	echo "Initializing deployment" >> ${logFilePath};
			`;

			await execAsyncRemote(server.serverId, command);
		} else {
			await fsPromises.mkdir(path.join(LOGS_PATH, appName), {
				recursive: true,
			});
			await fsPromises.writeFile(logFilePath, "Initializing deployment");
		}

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				title: deployment.title || "Deployment",
				status: "running",
				logPath: logFilePath,
				description: deployment.description || "",
				previewDeploymentId: deployment.previewDeploymentId,
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await updatePreviewDeployment(deployment.previewDeploymentId, {
			previewStatus: "error",
		});
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create the deployment",
		});
	}
};

export const createDeploymentCompose = async (
	deployment: Omit<
		typeof apiCreateDeploymentCompose._type,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	const compose = await findComposeById(deployment.composeId);
	try {
		await removeLastTenComposeDeployments(
			deployment.composeId,
			compose.serverId,
		);
		const { LOGS_PATH } = paths(!!compose.serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${compose.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, compose.appName, fileName);

		if (compose.serverId) {
			const server = await findServerById(compose.serverId);

			const command = `
mkdir -p ${LOGS_PATH}/${compose.appName};
echo "Initializing deployment" >> ${logFilePath};
`;

			await execAsyncRemote(server.serverId, command);
		} else {
			await fsPromises.mkdir(path.join(LOGS_PATH, compose.appName), {
				recursive: true,
			});
			await fsPromises.writeFile(logFilePath, "Initializing deployment");
		}

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				composeId: deployment.composeId,
				title: deployment.title || "Deployment",
				description: deployment.description || "",
				status: "running",
				logPath: logFilePath,
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await updateCompose(compose.composeId, {
			composeStatus: "error",
		});
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create the deployment",
		});
	}
};

export const removeDeployment = async (deploymentId: string) => {
	try {
		const deployment = await db
			.delete(deployments)
			.where(eq(deployments.deploymentId, deploymentId))
			.returning();
		return deployment[0];
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to delete this deployment",
		});
	}
};

export const removeDeploymentsByApplicationId = async (
	applicationId: string,
) => {
	await db
		.delete(deployments)
		.where(eq(deployments.applicationId, applicationId))
		.returning();
};

const removeLastTenDeployments = async (
	applicationId: string,
	serverId: string | null,
) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments.applicationId, applicationId),
		orderBy: desc(deployments.createdAt),
	});

	if (deploymentList.length > 10) {
		const deploymentsToDelete = deploymentList.slice(10);
		if (serverId) {
			let command = "";
			for (const oldDeployment of deploymentsToDelete) {
				const logPath = path.join(oldDeployment.logPath);

				command += `
				rm -rf ${logPath};
				`;
				await removeDeployment(oldDeployment.deploymentId);
			}

			await execAsyncRemote(serverId, command);
		} else {
			for (const oldDeployment of deploymentsToDelete) {
				const logPath = path.join(oldDeployment.logPath);
				if (existsSync(logPath)) {
					await fsPromises.unlink(logPath);
				}
				await removeDeployment(oldDeployment.deploymentId);
			}
		}
	}
};

const removeLastTenComposeDeployments = async (
	composeId: string,
	serverId: string | null,
) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments.composeId, composeId),
		orderBy: desc(deployments.createdAt),
	});
	if (deploymentList.length > 10) {
		if (serverId) {
			let command = "";
			const deploymentsToDelete = deploymentList.slice(10);
			for (const oldDeployment of deploymentsToDelete) {
				const logPath = path.join(oldDeployment.logPath);

				command += `
				rm -rf ${logPath};
				`;
				await removeDeployment(oldDeployment.deploymentId);
			}

			await execAsyncRemote(serverId, command);
		} else {
			const deploymentsToDelete = deploymentList.slice(10);
			for (const oldDeployment of deploymentsToDelete) {
				const logPath = path.join(oldDeployment.logPath);
				if (existsSync(logPath)) {
					await fsPromises.unlink(logPath);
				}
				await removeDeployment(oldDeployment.deploymentId);
			}
		}
	}
};

export const removeLastTenPreviewDeploymenById = async (
	previewDeploymentId: string,
	serverId: string | null,
) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments.previewDeploymentId, previewDeploymentId),
		orderBy: desc(deployments.createdAt),
	});

	if (deploymentList.length > 10) {
		const deploymentsToDelete = deploymentList.slice(10);
		if (serverId) {
			let command = "";
			for (const oldDeployment of deploymentsToDelete) {
				const logPath = path.join(oldDeployment.logPath);

				command += `
				rm -rf ${logPath};
				`;
				await removeDeployment(oldDeployment.deploymentId);
			}

			await execAsyncRemote(serverId, command);
		} else {
			for (const oldDeployment of deploymentsToDelete) {
				const logPath = path.join(oldDeployment.logPath);
				if (existsSync(logPath)) {
					await fsPromises.unlink(logPath);
				}
				await removeDeployment(oldDeployment.deploymentId);
			}
		}
	}
};

export const removeDeployments = async (application: Application) => {
	const { appName, applicationId } = application;
	const { LOGS_PATH } = paths(!!application.serverId);
	const logsPath = path.join(LOGS_PATH, appName);
	if (application.serverId) {
		await execAsyncRemote(application.serverId, `rm -rf ${logsPath}`);
	} else {
		await removeDirectoryIfExistsContent(logsPath);
	}
	await removeDeploymentsByApplicationId(applicationId);
};

export const removeDeploymentsByPreviewDeploymentId = async (
	previewDeployment: PreviewDeployment,
	serverId: string | null,
) => {
	const { appName } = previewDeployment;
	const { LOGS_PATH } = paths(!!serverId);
	const logsPath = path.join(LOGS_PATH, appName);
	if (serverId) {
		await execAsyncRemote(serverId, `rm -rf ${logsPath}`);
	} else {
		await removeDirectoryIfExistsContent(logsPath);
	}

	await db
		.delete(deployments)
		.where(
			eq(
				deployments.previewDeploymentId,
				previewDeployment.previewDeploymentId,
			),
		)
		.returning();
};

export const removeDeploymentsByComposeId = async (compose: Compose) => {
	const { appName } = compose;
	const { LOGS_PATH } = paths(!!compose.serverId);
	const logsPath = path.join(LOGS_PATH, appName);
	if (compose.serverId) {
		await execAsyncRemote(compose.serverId, `rm -rf ${logsPath}`);
	} else {
		await removeDirectoryIfExistsContent(logsPath);
	}

	await db
		.delete(deployments)
		.where(eq(deployments.composeId, compose.composeId))
		.returning();
};

export const findAllDeploymentsByApplicationId = async (
	applicationId: string,
) => {
	const deploymentsList = await db.query.deployments.findMany({
		where: eq(deployments.applicationId, applicationId),
		orderBy: desc(deployments.createdAt),
	});
	return deploymentsList;
};

export const findAllDeploymentsByComposeId = async (composeId: string) => {
	const deploymentsList = await db.query.deployments.findMany({
		where: eq(deployments.composeId, composeId),
		orderBy: desc(deployments.createdAt),
	});
	return deploymentsList;
};

export const updateDeployment = async (
	deploymentId: string,
	deploymentData: Partial<Deployment>,
) => {
	const application = await db
		.update(deployments)
		.set({
			...deploymentData,
		})
		.where(eq(deployments.deploymentId, deploymentId))
		.returning();

	return application;
};

export const updateDeploymentStatus = async (
	deploymentId: string,
	deploymentStatus: Deployment["status"],
) => {
	const application = await db
		.update(deployments)
		.set({
			status: deploymentStatus,
		})
		.where(eq(deployments.deploymentId, deploymentId))
		.returning();

	return application;
};

export const createServerDeployment = async (
	deployment: Omit<
		typeof apiCreateDeploymentServer._type,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	try {
		const { LOGS_PATH } = paths();

		const server = await findServerById(deployment.serverId);
		await removeLastFiveDeployments(deployment.serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${server.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, server.appName, fileName);
		await fsPromises.mkdir(path.join(LOGS_PATH, server.appName), {
			recursive: true,
		});
		await fsPromises.writeFile(logFilePath, "Initializing Setup Server");
		const deploymentCreate = await db
			.insert(deployments)
			.values({
				serverId: server.serverId,
				title: deployment.title || "Deployment",
				description: deployment.description || "",
				status: "running",
				logPath: logFilePath,
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create the deployment",
		});
	}
};

export const removeLastFiveDeployments = async (serverId: string) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments.serverId, serverId),
		orderBy: desc(deployments.createdAt),
	});
	if (deploymentList.length >= 5) {
		const deploymentsToDelete = deploymentList.slice(4);
		for (const oldDeployment of deploymentsToDelete) {
			const logPath = path.join(oldDeployment.logPath);
			if (existsSync(logPath)) {
				await fsPromises.unlink(logPath);
			}
			await removeDeployment(oldDeployment.deploymentId);
		}
	}
};

export const removeDeploymentsByServerId = async (server: Server) => {
	const { LOGS_PATH } = paths();
	const { appName } = server;
	const logsPath = path.join(LOGS_PATH, appName);
	await removeDirectoryIfExistsContent(logsPath);
	await db
		.delete(deployments)
		.where(eq(deployments.serverId, server.serverId))
		.returning();
};

export const findAllDeploymentsByServerId = async (serverId: string) => {
	const deploymentsList = await db.query.deployments.findMany({
		where: eq(deployments.serverId, serverId),
		orderBy: desc(deployments.createdAt),
	});
	return deploymentsList;
};
