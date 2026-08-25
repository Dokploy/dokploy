import { logger } from "@dokploy/server/lib/logger";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import { quote } from "shell-quote";
import { ExecError, execAsync, execAsyncRemote } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";
import { redactRcloneCredentials } from "./redact";
import {
	BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
	getBackupCommand,
	getContainerSearchCommand,
} from "./utils";
import {
	BackupWorkerTaskError,
	type DockerClient,
	findRunningServiceTask,
	getBackupResourceNames,
	getBackupTargetServiceName,
	getBackupWorkerServiceSpec,
	waitForBackupWorkerTask,
	waitForReplacementServiceTask,
} from "./worker";

const MAX_BACKUP_WORKER_ATTEMPTS = 2;

type ExecuteBackupInput = {
	backup: BackupSchedule;
	executionId: string;
	logPath: string;
	rcloneDestination: string;
	rcloneFlags: string[];
	serverId?: string | null;
};

const runHostCommand = (
	serverId: string | null | undefined,
	command: string,
) => {
	if (serverId) {
		return execAsyncRemote(serverId, command);
	}

	return execAsync(command, { shell: "/bin/bash" });
};

const isNotFoundError = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"statusCode" in error &&
	error.statusCode === 404;

const getSafeErrorMessage = (error: unknown) => {
	if (error instanceof ExecError) {
		const output = error.stderr?.trim() || error.stdout?.trim();
		return redactRcloneCredentials(
			output || `command exited with code ${error.exitCode ?? "unknown"}`,
		);
	}
	return redactRcloneCredentials(
		error instanceof Error ? error.message : String(error),
	);
};

const appendBackupError = async (
	serverId: string | null | undefined,
	logPath: string,
	error: unknown,
) => {
	const message = getSafeErrorMessage(error);
	const command = `printf '[%s] ❌ Error: %s\\n' "$(date)" ${quote([message])} >> ${quote([logPath])}`;
	try {
		await runHostCommand(serverId, command);
	} catch (logError) {
		logger.error(
			{ error: getSafeErrorMessage(logError) },
			"Failed to append backup worker error to deployment log",
		);
	}
};

const appendBackupMessage = async (
	serverId: string | null | undefined,
	logPath: string,
	message: string,
) => {
	const command = `printf '[%s] %s\n' "$(date)" ${quote([message])} >> ${quote([logPath])}`;
	try {
		await runHostCommand(serverId, command);
	} catch (logError) {
		logger.error(
			{ error: getSafeErrorMessage(logError) },
			"Failed to append backup worker progress to deployment log",
		);
	}
};

const collectServiceLogs = (
	serverId: string | null | undefined,
	serviceName: string,
	logPath: string,
) => {
	const quotedServiceName = quote([serviceName]);
	return runHostCommand(
		serverId,
		`if docker service inspect ${quotedServiceName} >/dev/null 2>&1; then docker service logs --raw ${quotedServiceName} >> ${quote([logPath])} 2>&1; fi`,
	);
};

const removeResource = async (
	remove: () => Promise<unknown>,
	resource: "secret" | "service",
) => {
	try {
		await remove();
		return null;
	} catch (error) {
		if (isNotFoundError(error)) {
			return null;
		}
		return new Error(
			`Failed to remove backup worker ${resource}: ${getSafeErrorMessage(error)}`,
		);
	}
};

const isDatabaseTaskRelocationError = (error: unknown) =>
	error instanceof BackupWorkerTaskError &&
	error.exitCode === BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE;

const isDirectDatabaseTaskRelocationError = (error: unknown) =>
	error instanceof ExecError &&
	error.exitCode === BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE;

const runBackupOnWorkerAttempt = async ({
	input: {
		backup,
		executionId,
		logPath,
		rcloneDestination,
		rcloneFlags,
		serverId,
	},
	attempt,
	databaseTask: { containerId, nodeId },
	docker,
}: {
	input: ExecuteBackupInput;
	attempt: number;
	databaseTask: { containerId: string; nodeId: string };
	docker: DockerClient;
}) => {
	const { secretName, serviceName } = getBackupResourceNames(
		executionId,
		attempt,
	);
	const labels = {
		"dokploy.backup.id": backup.backupId,
		"dokploy.deployment.id": executionId,
		"dokploy.managed": "true",
		"dokploy.resource": "database-backup-worker",
	};
	// Keep database and S3 credentials out of the inspectable service arguments.
	const workerCommand = getBackupCommand(
		backup,
		rcloneFlags,
		rcloneDestination,
		"/proc/1/fd/1",
		{
			containerId,
			containerNotFoundExitCode: BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
		},
	);
	const service = docker.getService(serviceName);
	const secret = docker.getSecret(secretName);

	let serviceMayExist = false;
	let secretMayExist = false;
	let primaryError: unknown;

	try {
		await appendBackupMessage(
			serverId,
			logPath,
			`Preparing backup worker attempt ${attempt + 1} of ${MAX_BACKUP_WORKER_ATTEMPTS} on node ${nodeId}...`,
		);

		secretMayExist = true;
		const createdSecret = (await docker.createSecret({
			Name: secretName,
			Labels: labels,
			Data: Buffer.from(workerCommand).toString("base64"),
		})) as { id?: string };
		const secretId = createdSecret.id;
		if (!secretId) {
			throw new Error("Docker did not return a backup worker secret ID");
		}

		serviceMayExist = true;
		const createdService = await docker.createService(
			getBackupWorkerServiceSpec({
				backupId: backup.backupId,
				executionId,
				nodeId,
				secretId,
				secretName,
				serviceName,
			}),
		);
		if (!createdService.id) {
			throw new Error("Docker did not return a backup worker service ID");
		}
		await waitForBackupWorkerTask(docker, createdService.id);
	} catch (error) {
		primaryError = error;
	} finally {
		const cleanupErrors: Error[] = [];

		if (serviceMayExist) {
			// Collect once after the terminal task state to avoid follower races or duplicates.
			if (!isDatabaseTaskRelocationError(primaryError)) {
				try {
					await collectServiceLogs(serverId, serviceName, logPath);
				} catch (error) {
					const message = getSafeErrorMessage(error);
					logger.error(
						{ error: message },
						"Failed to collect backup worker logs",
					);
					await appendBackupMessage(
						serverId,
						logPath,
						`⚠️ Warning: Could not collect backup worker logs: ${message}`,
					);
				}
			}

			const error = await removeResource(() => service.remove(), "service");
			if (error) cleanupErrors.push(error);
		}
		if (secretMayExist) {
			const error = await removeResource(() => secret.remove(), "secret");
			if (error) cleanupErrors.push(error);
		}

		if (primaryError) {
			if (cleanupErrors.length > 0) {
				logger.error(
					{ errors: cleanupErrors.map((error) => error.message) },
					"Backup worker cleanup also failed",
				);
				if (isDatabaseTaskRelocationError(primaryError)) {
					primaryError = new Error(
						`${getSafeErrorMessage(primaryError)}; ${cleanupErrors.map((error) => error.message).join("; ")}`,
					);
				}
			}
		} else if (cleanupErrors.length > 0) {
			primaryError = new Error(
				cleanupErrors.map((error) => error.message).join("; "),
			);
		}
	}

	if (primaryError) {
		throw primaryError;
	}
};

const runBackupOnWorker = async (
	input: ExecuteBackupInput,
	previousContainerId?: string,
) => {
	const serviceTarget = getBackupTargetServiceName(input.backup);
	if (!serviceTarget) {
		throw new Error("Could not determine the Swarm service for this backup");
	}

	const docker = await getRemoteDocker(input.serverId);
	let databaseTask = previousContainerId
		? await waitForReplacementServiceTask(
				docker,
				serviceTarget,
				previousContainerId,
			)
		: await findRunningServiceTask(docker, serviceTarget);
	for (let attempt = 0; attempt < MAX_BACKUP_WORKER_ATTEMPTS; attempt += 1) {
		try {
			await runBackupOnWorkerAttempt({
				attempt,
				databaseTask,
				docker,
				input,
			});
			return;
		} catch (error) {
			if (!isDatabaseTaskRelocationError(error)) {
				throw error;
			}
			if (attempt === MAX_BACKUP_WORKER_ATTEMPTS - 1) {
				throw new Error(
					`Database task moved while the backup worker was starting; retry limit reached (${getSafeErrorMessage(error)})`,
					{ cause: error },
				);
			}

			await appendBackupMessage(
				input.serverId,
				input.logPath,
				"Database task moved before the backup started; rediscovering its node and retrying...",
			);
			databaseTask = await waitForReplacementServiceTask(
				docker,
				serviceTarget,
				databaseTask.containerId,
			);
		}
	}
};

export const executeBackup = async (input: ExecuteBackupInput) => {
	try {
		let previousContainerId: string | undefined;
		const containerSearch = getContainerSearchCommand(input.backup);
		if (!containerSearch) {
			throw new Error("Could not build the database container search command");
		}

		const { stdout } = await runHostCommand(input.serverId, containerSearch);
		const directContainerId = stdout.trim().split(/\s+/)[0];
		if (directContainerId) {
			const command = getBackupCommand(
				input.backup,
				input.rcloneFlags,
				input.rcloneDestination,
				input.logPath,
				{
					containerId: directContainerId,
					containerNotFoundExitCode:
						BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
				},
			);
			try {
				await runHostCommand(input.serverId, command);
				return { mode: "direct" as const };
			} catch (error) {
				if (!isDirectDatabaseTaskRelocationError(error)) {
					throw error;
				}
				await appendBackupMessage(
					input.serverId,
					input.logPath,
					"Database task moved off this node before the backup started; switching to a backup worker...",
				);
				previousContainerId = directContainerId;
			}
		}

		await runBackupOnWorker(input, previousContainerId);
		return { mode: "swarm-worker" as const };
	} catch (error) {
		await appendBackupError(input.serverId, input.logPath, error);
		throw error;
	}
};
