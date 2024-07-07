import { existsSync, promises as fsPromises } from "node:fs";
import path from "node:path";
import { LOGS_PATH } from "@/server/constants";
import { db } from "@/server/db";
import {
	type apiCreateDeployment,
	type apiCreateDeploymentCompose,
	deployments,
} from "@/server/db/schema";
import { removeDirectoryIfExistsContent } from "@/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { format } from "date-fns";
import { desc, eq } from "drizzle-orm";
import { type Application, findApplicationById } from "./application";
import { type Compose, findComposeById } from "./compose";

export type Deployment = typeof deployments.$inferSelect;
type CreateDeploymentInput = Omit<
	Deployment,
	"deploymentId" | "createdAt" | "status" | "logPath"
>;

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
	try {
		const application = await findApplicationById(deployment.applicationId);

		await removeLastTenDeployments(deployment.applicationId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${application.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, application.appName, fileName);
		await fsPromises.mkdir(path.join(LOGS_PATH, application.appName), {
			recursive: true,
		});
		await fsPromises.writeFile(logFilePath, "Initializing deployment");
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
	try {
		const compose = await findComposeById(deployment.composeId);

		await removeLastTenComposeDeployments(deployment.composeId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${compose.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, compose.appName, fileName);
		await fsPromises.mkdir(path.join(LOGS_PATH, compose.appName), {
			recursive: true,
		});
		await fsPromises.writeFile(logFilePath, "Initializing deployment");
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

const removeLastTenDeployments = async (applicationId: string) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments.applicationId, applicationId),
		orderBy: desc(deployments.createdAt),
	});
	if (deploymentList.length > 10) {
		const deploymentsToDelete = deploymentList.slice(10);
		for (const oldDeployment of deploymentsToDelete) {
			const logPath = path.join(oldDeployment.logPath);
			if (existsSync(logPath)) {
				await fsPromises.unlink(logPath);
			}
			await removeDeployment(oldDeployment.deploymentId);
		}
	}
};

const removeLastTenComposeDeployments = async (composeId: string) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments.composeId, composeId),
		orderBy: desc(deployments.createdAt),
	});
	if (deploymentList.length > 10) {
		const deploymentsToDelete = deploymentList.slice(10);
		for (const oldDeployment of deploymentsToDelete) {
			const logPath = path.join(oldDeployment.logPath);
			if (existsSync(logPath)) {
				await fsPromises.unlink(logPath);
			}
			await removeDeployment(oldDeployment.deploymentId);
		}
	}
};

export const removeDeployments = async (application: Application) => {
	const { appName, applicationId } = application;
	const logsPath = path.join(LOGS_PATH, appName);
	await removeDirectoryIfExistsContent(logsPath);
	await removeDeploymentsByApplicationId(applicationId);
};

export const removeDeploymentsByComposeId = async (compose: Compose) => {
	const { appName } = compose;
	const logsPath = path.join(LOGS_PATH, appName);
	await removeDirectoryIfExistsContent(logsPath);
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
