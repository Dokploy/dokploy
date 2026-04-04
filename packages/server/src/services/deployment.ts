import { existsSync, promises as fsPromises } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateDeployment,
	type apiCreateDeploymentBackup,
	type apiCreateDeploymentCompose,
	type apiCreateDeploymentPreview,
	type apiCreateDeploymentSchedule,
	type apiCreateDeploymentServer,
	type apiCreateDeploymentVolumeBackup,
	applications,
	compose,
	deployments,
	environments,
	projects,
} from "@dokploy/server/db/schema";
import { removeDirectoryIfExistsContent } from "@dokploy/server/utils/filesystem/directory";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { format } from "date-fns";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	type Application,
	findApplicationById,
	updateApplicationStatus,
} from "./application";
import { findBackupById } from "./backup";
import { type Compose, findComposeById, updateCompose } from "./compose";
import {
	findPreviewDeploymentById,
	type PreviewDeployment,
	updatePreviewDeployment,
} from "./preview-deployment";
import { removeRollbackById } from "./rollbacks";
import { findScheduleById } from "./schedule";
import { findServerById, type Server } from "./server";
import { findVolumeBackupById } from "./volume-backups";

export type ServicePath = { href: string | null; label: string };

export async function resolveServicePath(
	orgId: string,
	data: Record<string, unknown>,
): Promise<ServicePath> {
	try {
		const applicationId = data?.applicationId as string | undefined;
		const composeId = data?.composeId as string | undefined;
		if (applicationId) {
			const app = await findApplicationById(applicationId);
			if (app.environment.project.organizationId !== orgId) {
				return { href: null, label: "Application" };
			}
			return {
				href: `/dashboard/project/${app.environment.project.projectId}/environment/${app.environment.environmentId}/services/application/${app.applicationId}`,
				label: "Application",
			};
		}
		if (composeId) {
			const comp = await findComposeById(composeId);
			if (comp.environment.project.organizationId !== orgId) {
				return { href: null, label: "Compose" };
			}
			return {
				href: `/dashboard/project/${comp.environment.project.projectId}/environment/${comp.environment.environmentId}/services/compose/${comp.composeId}`,
				label: "Compose",
			};
		}
	} catch {
		// not found or unauthorized
	}
	return { href: null, label: "—" };
}

export type Deployment = typeof deployments.$inferSelect;

const finalDeploymentStatuses = new Set<Deployment["status"]>([
	"done",
	"error",
	"cancelled",
]);

const resolveDeploymentStatus = (status?: Deployment["status"]) =>
	status ?? "running";

const getDeploymentStartedAt = (status: Deployment["status"]) =>
	status === "running" ? new Date().toISOString() : null;

const getInitialDeploymentLogLines = (
	status: Deployment["status"],
	extraLines: string[] = [],
) =>
	status === "queued"
		? ["Deployment queued", "Waiting for available worker", ...extraLines]
		: ["Initializing deployment", ...extraLines];

type ApplicationDeploymentInput = Omit<
	z.infer<typeof apiCreateDeployment>,
	"deploymentId" | "createdAt" | "status" | "logPath"
> & {
	deploymentId?: string;
	status?: Deployment["status"];
};

type PreviewDeploymentInput = Omit<
	z.infer<typeof apiCreateDeploymentPreview>,
	"deploymentId" | "createdAt" | "status" | "logPath"
> & {
	deploymentId?: string;
	status?: Deployment["status"];
};

type ComposeDeploymentInput = Omit<
	z.infer<typeof apiCreateDeploymentCompose>,
	"deploymentId" | "createdAt" | "status" | "logPath"
> & {
	deploymentId?: string;
	status?: Deployment["status"];
};

export const findDeploymentById = async (deploymentId: string) => {
	const deployment = await db.query.deployments.findFirst({
		where: eq(deployments.deploymentId, deploymentId),
		with: {
			application: true,
			schedule: true,
		},
	});
	if (!deployment) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Deployment not found",
		});
	}
	return deployment;
};

const findDeploymentForLogUpdate = async (deploymentId: string) => {
	return db.query.deployments.findFirst({
		where: eq(deployments.deploymentId, deploymentId),
		with: {
			application: {
				columns: {
					serverId: true,
					buildServerId: true,
				},
			},
			compose: {
				columns: {
					serverId: true,
				},
			},
			previewDeployment: {
				columns: {
					previewDeploymentId: true,
				},
				with: {
					application: {
						columns: {
							serverId: true,
						},
					},
				},
			},
		},
	});
};

const resolveDeploymentLogServerId = (
	deployment: Awaited<ReturnType<typeof findDeploymentForLogUpdate>>,
) => {
	if (!deployment) {
		return null;
	}

	return (
		deployment.buildServerId ||
		deployment.serverId ||
		deployment.application?.buildServerId ||
		deployment.application?.serverId ||
		deployment.compose?.serverId ||
		deployment.previewDeployment?.application?.serverId ||
		null
	);
};

const appendDeploymentLogLines = async (
	deployment: NonNullable<
		Awaited<ReturnType<typeof findDeploymentForLogUpdate>>
	>,
	lines: string[],
) => {
	if (lines.length === 0) {
		return;
	}

	const logContent = `${lines.join("\n")}\n`;
	const logServerId = resolveDeploymentLogServerId(deployment);

	if (logServerId) {
		const encodedLogContent = Buffer.from(logContent).toString("base64");
		await execAsyncRemote(
			logServerId,
			`mkdir -p ${JSON.stringify(path.dirname(deployment.logPath))}; echo "${encodedLogContent}" | base64 -d >> ${JSON.stringify(deployment.logPath)};`,
		);
		return;
	}

	await fsPromises.mkdir(path.dirname(deployment.logPath), {
		recursive: true,
	});
	await fsPromises.appendFile(deployment.logPath, logContent);
};

const writeDeploymentLogPreamble = async ({
	logPath,
	serverId,
	lines,
}: {
	logPath: string;
	serverId?: string | null;
	lines: string[];
}) => {
	const encodedLogLines = lines
		.map(
			(line) => `echo ${JSON.stringify(line)} >> ${JSON.stringify(logPath)};`,
		)
		.join("\n");

	if (serverId) {
		const server = await findServerById(serverId);
		await execAsyncRemote(
			server.serverId,
			`mkdir -p ${JSON.stringify(path.dirname(logPath))};\n${encodedLogLines}`,
		);
		return;
	}

	await fsPromises.mkdir(path.dirname(logPath), {
		recursive: true,
	});
	await fsPromises.writeFile(logPath, `${lines.join("\n")}\n`);
};

const failDeployment = async (
	deploymentId: string,
	errorMessage: string,
	currentStatus?: Deployment["status"],
) => {
	const conditions = [eq(deployments.deploymentId, deploymentId)];

	if (currentStatus) {
		conditions.push(eq(deployments.status, currentStatus));
	}

	const [deployment] = await db
		.update(deployments)
		.set({
			status: "error",
			errorMessage,
			finishedAt: new Date().toISOString(),
		})
		.where(conditions.length === 1 ? conditions[0]! : and(...conditions))
		.returning();

	return deployment ?? null;
};

export const findDeploymentByApplicationId = async (applicationId: string) => {
	const deployment = await db.query.deployments.findFirst({
		where: eq(deployments.applicationId, applicationId),
	});

	if (!deployment) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Deployment not found",
		});
	}
	return deployment;
};

export const createDeployment = async (
	deployment: ApplicationDeploymentInput,
) => {
	const application = await findApplicationById(deployment.applicationId);
	await removeLastTenDeployments(
		deployment.applicationId,
		"application",
		application.serverId,
	);
	try {
		const status = resolveDeploymentStatus(deployment.status);
		const startedAt = getDeploymentStartedAt(status);
		const serverId = application.buildServerId || application.serverId;

		const { LOGS_PATH } = paths(!!serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${application.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, application.appName, fileName);
		const serverLabel = serverId ? "Build Server" : "Dokploy Server";
		const logLines = getInitialDeploymentLogLines(status, [
			`Building on ${serverLabel}`,
		]);

		await writeDeploymentLogPreamble({
			logPath: logFilePath,
			serverId,
			lines: logLines,
		});

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				...(deployment.deploymentId && {
					deploymentId: deployment.deploymentId,
				}),
				applicationId: deployment.applicationId,
				title: deployment.title || "Deployment",
				status,
				logPath: logFilePath,
				description: deployment.description || "",
				startedAt,
				...(application.buildServerId && {
					buildServerId: application.buildServerId,
				}),
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await db
			.insert(deployments)
			.values({
				...(deployment.deploymentId && {
					deploymentId: deployment.deploymentId,
				}),
				applicationId: deployment.applicationId,
				title: deployment.title || "Deployment",
				status: "error",
				logPath: "",
				description: deployment.description || "",
				errorMessage: `An error have occurred: ${error instanceof Error ? error.message : error}`,
				startedAt: getDeploymentStartedAt(
					resolveDeploymentStatus(deployment.status),
				),
				finishedAt: new Date().toISOString(),
			})
			.returning();
		await updateApplicationStatus(application.applicationId, "error");
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the deployment",
		});
	}
};

export const createDeploymentPreview = async (
	deployment: PreviewDeploymentInput,
) => {
	const previewDeployment = await findPreviewDeploymentById(
		deployment.previewDeploymentId,
	);
	await removeLastTenDeployments(
		deployment.previewDeploymentId,
		"previewDeployment",
		previewDeployment?.application?.serverId,
	);
	try {
		const status = resolveDeploymentStatus(deployment.status);
		const startedAt = getDeploymentStartedAt(status);
		const appName = `${previewDeployment.appName}`;
		const { LOGS_PATH } = paths(!!previewDeployment?.application?.serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, appName, fileName);
		const logLines = getInitialDeploymentLogLines(status);

		await writeDeploymentLogPreamble({
			logPath: logFilePath,
			serverId: previewDeployment?.application?.serverId,
			lines: logLines,
		});

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				...(deployment.deploymentId && {
					deploymentId: deployment.deploymentId,
				}),
				title: deployment.title || "Deployment",
				status,
				logPath: logFilePath,
				description: deployment.description || "",
				previewDeploymentId: deployment.previewDeploymentId,
				startedAt,
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await db
			.insert(deployments)
			.values({
				...(deployment.deploymentId && {
					deploymentId: deployment.deploymentId,
				}),
				previewDeploymentId: deployment.previewDeploymentId,
				title: deployment.title || "Deployment",
				status: "error",
				logPath: "",
				description: deployment.description || "",
				errorMessage: `An error have occurred: ${error instanceof Error ? error.message : error}`,
				startedAt: getDeploymentStartedAt(
					resolveDeploymentStatus(deployment.status),
				),
				finishedAt: new Date().toISOString(),
			})
			.returning();
		await updatePreviewDeployment(deployment.previewDeploymentId, {
			previewStatus: "error",
		});
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the deployment",
		});
	}
};

export const createDeploymentCompose = async (
	deployment: ComposeDeploymentInput,
) => {
	const compose = await findComposeById(deployment.composeId);
	await removeLastTenDeployments(
		deployment.composeId,
		"compose",
		compose.serverId,
	);
	try {
		const status = resolveDeploymentStatus(deployment.status);
		const startedAt = getDeploymentStartedAt(status);
		const { LOGS_PATH } = paths(!!compose.serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${compose.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, compose.appName, fileName);
		const logLines = getInitialDeploymentLogLines(status);

		await writeDeploymentLogPreamble({
			logPath: logFilePath,
			serverId: compose.serverId,
			lines: logLines,
		});

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				...(deployment.deploymentId && {
					deploymentId: deployment.deploymentId,
				}),
				composeId: deployment.composeId,
				title: deployment.title || "Deployment",
				description: deployment.description || "",
				status,
				logPath: logFilePath,
				startedAt,
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await db
			.insert(deployments)
			.values({
				...(deployment.deploymentId && {
					deploymentId: deployment.deploymentId,
				}),
				composeId: deployment.composeId,
				title: deployment.title || "Deployment",
				status: "error",
				logPath: "",
				description: deployment.description || "",
				errorMessage: `An error have occurred: ${error instanceof Error ? error.message : error}`,
				startedAt: getDeploymentStartedAt(
					resolveDeploymentStatus(deployment.status),
				),
				finishedAt: new Date().toISOString(),
			})
			.returning();
		await updateCompose(compose.composeId, {
			composeStatus: "error",
		});
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the deployment",
		});
	}
};

export const createDeploymentBackup = async (
	deployment: Omit<
		z.infer<typeof apiCreateDeploymentBackup>,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	const backup = await findBackupById(deployment.backupId);

	let serverId: string | null | undefined;
	if (backup.backupType === "database") {
		serverId =
			backup.postgres?.serverId ||
			backup.mariadb?.serverId ||
			backup.mysql?.serverId ||
			backup.mongo?.serverId;
	} else if (backup.backupType === "compose") {
		serverId = backup.compose?.serverId;
	}
	await removeLastTenDeployments(deployment.backupId, "backup", serverId);
	try {
		const { LOGS_PATH } = paths(!!serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${backup.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(LOGS_PATH, backup.appName, fileName);

		if (serverId) {
			const server = await findServerById(serverId);

			const command = `
mkdir -p ${LOGS_PATH}/${backup.appName};
echo "Initializing backup\n" >> ${logFilePath};
`;

			await execAsyncRemote(server.serverId, command);
		} else {
			await fsPromises.mkdir(path.join(LOGS_PATH, backup.appName), {
				recursive: true,
			});
			await fsPromises.writeFile(logFilePath, "Initializing backup\n");
		}

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				backupId: deployment.backupId,
				title: deployment.title || "Backup",
				description: deployment.description || "",
				status: "running",
				logPath: logFilePath,
				startedAt: new Date().toISOString(),
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the backup",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		await db
			.insert(deployments)
			.values({
				backupId: deployment.backupId,
				title: deployment.title || "Backup",
				status: "error",
				logPath: "",
				description: deployment.description || "",
				errorMessage: `An error have occurred: ${error instanceof Error ? error.message : error}`,
				startedAt: new Date().toISOString(),
				finishedAt: new Date().toISOString(),
			})
			.returning();
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the backup",
		});
	}
};

export const createDeploymentSchedule = async (
	deployment: Omit<
		z.infer<typeof apiCreateDeploymentSchedule>,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	const schedule = await findScheduleById(deployment.scheduleId);

	const serverId =
		schedule.application?.serverId ||
		schedule.compose?.serverId ||
		schedule.server?.serverId;
	await removeLastTenDeployments(deployment.scheduleId, "schedule", serverId);
	try {
		const { SCHEDULES_PATH } = paths(!!serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${schedule.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(SCHEDULES_PATH, schedule.appName, fileName);

		if (serverId) {
			const server = await findServerById(serverId);

			const command = `
				mkdir -p ${SCHEDULES_PATH}/${schedule.appName};
            	echo "Initializing schedule" >> ${logFilePath};
			`;

			await execAsyncRemote(server.serverId, command);
		} else {
			await fsPromises.mkdir(path.join(SCHEDULES_PATH, schedule.appName), {
				recursive: true,
			});
			await fsPromises.writeFile(logFilePath, "Initializing schedule\n");
		}

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				scheduleId: deployment.scheduleId,
				title: deployment.title || "Deployment",
				status: "running",
				logPath: logFilePath,
				description: deployment.description || "",
				startedAt: new Date().toISOString(),
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		console.log(error);
		await db
			.insert(deployments)
			.values({
				scheduleId: deployment.scheduleId,
				title: deployment.title || "Deployment",
				status: "error",
				logPath: "",
				description: deployment.description || "",
				errorMessage: `An error have occurred: ${error instanceof Error ? error.message : error}`,
				startedAt: new Date().toISOString(),
				finishedAt: new Date().toISOString(),
			})
			.returning();

		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the deployment",
		});
	}
};

export const createDeploymentVolumeBackup = async (
	deployment: Omit<
		z.infer<typeof apiCreateDeploymentVolumeBackup>,
		"deploymentId" | "createdAt" | "status" | "logPath"
	>,
) => {
	const volumeBackup = await findVolumeBackupById(deployment.volumeBackupId);

	const serverId =
		volumeBackup.application?.serverId || volumeBackup.compose?.serverId;
	await removeLastTenDeployments(
		deployment.volumeBackupId,
		"volumeBackup",
		serverId,
	);
	try {
		const { VOLUME_BACKUPS_PATH } = paths(!!serverId);
		const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
		const fileName = `${volumeBackup.appName}-${formattedDateTime}.log`;
		const logFilePath = path.join(
			VOLUME_BACKUPS_PATH,
			volumeBackup.appName,
			fileName,
		);

		if (serverId) {
			const server = await findServerById(serverId);

			const command = `
				mkdir -p ${VOLUME_BACKUPS_PATH}/${volumeBackup.appName};
            	echo "Initializing volume backup" >> ${logFilePath};
			`;

			await execAsyncRemote(server.serverId, command);
		} else {
			await fsPromises.mkdir(
				path.join(VOLUME_BACKUPS_PATH, volumeBackup.appName),
				{
					recursive: true,
				},
			);
			await fsPromises.writeFile(logFilePath, "Initializing volume backup\n");
		}

		const deploymentCreate = await db
			.insert(deployments)
			.values({
				volumeBackupId: deployment.volumeBackupId,
				title: deployment.title || "Deployment",
				status: "running",
				logPath: logFilePath,
				description: deployment.description || "",
				startedAt: new Date().toISOString(),
			})
			.returning();
		if (deploymentCreate.length === 0 || !deploymentCreate[0]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		console.log(error);
		await db
			.insert(deployments)
			.values({
				volumeBackupId: deployment.volumeBackupId,
				title: deployment.title || "Deployment",
				status: "error",
				logPath: "",
				description: deployment.description || "",
				errorMessage: `An error have occurred: ${error instanceof Error ? error.message : error}`,
				startedAt: new Date().toISOString(),
				finishedAt: new Date().toISOString(),
			})
			.returning();

		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the deployment",
		});
	}
};

export const removeDeployment = async (deploymentId: string) => {
	try {
		const deployment = await db
			.delete(deployments)
			.where(eq(deployments.deploymentId, deploymentId))
			.returning()
			.then((result) => result[0]);

		if (!deployment) {
			return null;
		}

		const logPath = path.join(deployment.logPath);
		if (logPath && logPath !== ".") {
			const command = `rm -f ${logPath};`;
			if (deployment.serverId) {
				await execAsyncRemote(deployment.serverId, command);
			} else {
				await execAsync(command);
			}
		}

		return deployment;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error removing the deployment";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
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

const getDeploymentsByType = async (
	id: string,
	type:
		| "application"
		| "compose"
		| "server"
		| "schedule"
		| "previewDeployment"
		| "backup"
		| "volumeBackup",
) => {
	const deploymentList = await db.query.deployments.findMany({
		where: eq(deployments[`${type}Id`], id),
		orderBy: desc(deployments.createdAt),
		with: {
			rollback: true,
		},
	});
	return deploymentList;
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

const removeLastTenDeployments = async (
	id: string,
	type:
		| "application"
		| "compose"
		| "server"
		| "schedule"
		| "previewDeployment"
		| "backup"
		| "volumeBackup",
	serverId?: string | null,
) => {
	const deploymentList = await getDeploymentsByType(id, type);
	if (deploymentList.length > 10) {
		const deploymentsToDelete = deploymentList.slice(10);
		if (serverId) {
			let command = "";
			for (const oldDeployment of deploymentsToDelete) {
				try {
					const logPath = path.join(oldDeployment.logPath);
					if (oldDeployment.rollbackId) {
						await removeRollbackById(oldDeployment.rollbackId);
					}

					if (logPath && logPath !== ".") {
						command += `rm -rf ${logPath};`;
					}
					await removeDeployment(oldDeployment.deploymentId);
				} catch (err) {
					console.error(
						`Failed to remove deployment ${oldDeployment.deploymentId} during cleanup:`,
						err,
					);
				}
			}

			if (command) {
				await execAsyncRemote(serverId, command);
			}
		} else {
			for (const oldDeployment of deploymentsToDelete) {
				try {
					if (oldDeployment.rollbackId) {
						await removeRollbackById(oldDeployment.rollbackId);
					}
					const logPath = path.join(oldDeployment.logPath);
					if (
						logPath &&
						logPath !== "." &&
						existsSync(logPath) &&
						!oldDeployment.errorMessage
					) {
						await fsPromises.unlink(logPath);
					}
					await removeDeployment(oldDeployment.deploymentId);
				} catch (err) {
					console.error(
						`Failed to remove deployment ${oldDeployment.deploymentId} during cleanup:`,
						err,
					);
				}
			}
		}
	}
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

const centralizedDeploymentsWith = {
	application: {
		columns: { applicationId: true, name: true, appName: true },
		with: {
			environment: {
				columns: { environmentId: true, name: true },
				with: {
					project: {
						columns: { projectId: true, name: true },
					},
				},
			},
			server: {
				columns: { serverId: true, name: true, serverType: true },
			},
			buildServer: {
				columns: { serverId: true, name: true, serverType: true },
			},
		},
	},
	compose: {
		columns: { composeId: true, name: true, appName: true },
		with: {
			environment: {
				columns: { environmentId: true, name: true },
				with: {
					project: {
						columns: { projectId: true, name: true },
					},
				},
			},
			server: {
				columns: { serverId: true, name: true, serverType: true },
			},
		},
	},
	server: {
		columns: { serverId: true, name: true, serverType: true },
	},
	buildServer: {
		columns: { serverId: true, name: true, serverType: true },
	},
} as const;

async function getApplicationIdsInOrg(
	orgId: string,
	accessedServices: string[] | null,
): Promise<string[]> {
	const rows = await db
		.select({ applicationId: applications.applicationId })
		.from(applications)
		.innerJoin(
			environments,
			eq(applications.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(
			accessedServices !== null
				? and(
						eq(projects.organizationId, orgId),
						inArray(applications.applicationId, accessedServices),
					)
				: eq(projects.organizationId, orgId),
		);
	return rows.map((r) => r.applicationId);
}

async function getComposeIdsInOrg(
	orgId: string,
	accessedServices: string[] | null,
): Promise<string[]> {
	const rows = await db
		.select({ composeId: compose.composeId })
		.from(compose)
		.innerJoin(
			environments,
			eq(compose.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(
			accessedServices !== null
				? and(
						eq(projects.organizationId, orgId),
						inArray(compose.composeId, accessedServices),
					)
				: eq(projects.organizationId, orgId),
		);
	return rows.map((r) => r.composeId);
}

/**
 * All deployments for applications and compose in the org.
 * Pass accessedServices for members (only those services), null for owner/admin.
 */
export const findAllDeploymentsCentralized = async (
	orgId: string,
	accessedServices: string[] | null,
) => {
	if (accessedServices !== null && accessedServices.length === 0) {
		return [];
	}

	const [appIds, compIds] = await Promise.all([
		getApplicationIdsInOrg(orgId, accessedServices),
		getComposeIdsInOrg(orgId, accessedServices),
	]);

	if (appIds.length === 0 && compIds.length === 0) {
		return [];
	}

	const conditions = [
		...(appIds.length > 0 ? [inArray(deployments.applicationId, appIds)] : []),
		...(compIds.length > 0 ? [inArray(deployments.composeId, compIds)] : []),
	];
	const whereClause =
		conditions.length === 0
			? sql`1 = 0`
			: conditions.length === 1
				? conditions[0]
				: or(...conditions);

	return db.query.deployments.findMany({
		where: whereClause,
		orderBy: desc(deployments.createdAt),
		with: centralizedDeploymentsWith,
	});
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
			finishedAt: finalDeploymentStatuses.has(deploymentStatus)
				? new Date().toISOString()
				: null,
		})
		.where(eq(deployments.deploymentId, deploymentId))
		.returning();

	return application;
};

export const cancelQueuedDeployment = async (
	deploymentId: string,
	reason = "User requested cancellation",
) => {
	const deployment = await findDeploymentForLogUpdate(deploymentId);
	if (!deployment || deployment.status !== "queued") {
		return deployment;
	}

	const [cancelledDeployment] = await db
		.update(deployments)
		.set({
			status: "cancelled",
			finishedAt: new Date().toISOString(),
			errorMessage: null,
		})
		.where(
			and(
				eq(deployments.deploymentId, deploymentId),
				eq(deployments.status, "queued"),
			),
		)
		.returning();

	if (!cancelledDeployment) {
		return null;
	}

	try {
		await appendDeploymentLogLines(deployment, [
			"Deployment cancelled",
			`Reason: ${reason}`,
		]);
	} catch (error) {
		console.error(
			`Failed to append cancellation log for deployment ${deploymentId}:`,
			error,
		);
	}

	return cancelledDeployment;
};

export const failQueuedDeployment = async (
	deploymentId: string,
	error: unknown,
) => {
	const deployment = await findDeploymentForLogUpdate(deploymentId);
	if (!deployment || deployment.status !== "queued") {
		return null;
	}

	const errorMessage = `Failed to queue deployment: ${
		error instanceof Error ? error.message : String(error)
	}`;

	const failedDeployment = await failDeployment(
		deploymentId,
		errorMessage,
		"queued",
	);

	if (!failedDeployment) {
		return null;
	}

	try {
		await appendDeploymentLogLines(deployment, [errorMessage]);
	} catch (appendError) {
		console.error(
			`Failed to append queue failure log for deployment ${deploymentId}:`,
			appendError,
		);
	}

	return failedDeployment;
};

export const queueApplicationDeployment = async (
	deployment: Omit<ApplicationDeploymentInput, "deploymentId" | "status">,
) => {
	return createDeployment({
		...deployment,
		status: "queued",
	});
};

export const queuePreviewDeployment = async (
	deployment: Omit<PreviewDeploymentInput, "deploymentId" | "status">,
) => {
	return createDeploymentPreview({
		...deployment,
		status: "queued",
	});
};

export const queueComposeDeployment = async (
	deployment: Omit<ComposeDeploymentInput, "deploymentId" | "status">,
) => {
	return createDeploymentCompose({
		...deployment,
		status: "queued",
	});
};

export const startQueuedDeployment = async (deploymentId: string) => {
	const deployment = await db
		.update(deployments)
		.set({
			status: "running",
			startedAt: new Date().toISOString(),
			finishedAt: null,
			errorMessage: null,
		})
		.where(
			and(
				eq(deployments.deploymentId, deploymentId),
				eq(deployments.status, "queued"),
			),
		)
		.returning();

	if (deployment.length === 0 || !deployment[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Queued deployment not found",
		});
	}

	return deployment[0];
};

export const createServerDeployment = async (
	deployment: Omit<
		z.infer<typeof apiCreateDeploymentServer>,
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
				message: "Error creating the deployment",
			});
		}
		return deploymentCreate[0];
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error creating the deployment";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
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

export const clearOldDeployments = async (
	appName: string,
	serverId: string | null,
) => {
	const { LOGS_PATH } = paths(!!serverId);
	const folder = path.join(LOGS_PATH, appName);
	const command = `
		rm -rf ${folder};
	`;
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};
