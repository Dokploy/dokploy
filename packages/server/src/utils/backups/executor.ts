import { logger } from "@dokploy/server/lib/logger";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import { quote } from "shell-quote";
import { ExecError, execAsync, execAsyncRemote } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";
import { redactRcloneCredentials } from "./redact";
import { getBackupCommand, getContainerSearchCommand } from "./utils";
import {
	findRunningServiceTask,
	getBackupResourceNames,
	getBackupTargetServiceName,
	getBackupWorkerServiceSpec,
	waitForBackupWorkerTask,
} from "./worker";

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

const runBackupOnWorker = async ({
	backup,
	executionId,
	logPath,
	rcloneDestination,
	rcloneFlags,
	serverId,
}: ExecuteBackupInput) => {
	const serviceTarget = getBackupTargetServiceName(backup);
	if (!serviceTarget) {
		throw new Error("Could not determine the Swarm service for this backup");
	}

	const docker = await getRemoteDocker(serverId);
	const { containerId, nodeId } = await findRunningServiceTask(
		docker,
		serviceTarget,
	);
	const { secretName, serviceName } = getBackupResourceNames(executionId);
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
		{ containerId },
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
			`Preparing backup worker on node ${nodeId}...`,
		);

		secretMayExist = true;
		const createdSecret = (await docker.createSecret({
			Name: secretName,
			Labels: labels,
			Data: Buffer.from(workerCommand).toString("base64"),
		})) as { ID?: string };
		const secretId =
			createdSecret.ID || ((await secret.inspect()) as { ID?: string }).ID;
		if (!secretId) {
			throw new Error("Docker did not return a backup worker secret ID");
		}

		serviceMayExist = true;
		const createdService = (await docker.createService(
			getBackupWorkerServiceSpec({
				backupId: backup.backupId,
				executionId,
				nodeId,
				secretId,
				secretName,
				serviceName,
			}),
		)) as { ID?: string };
		await waitForBackupWorkerTask(docker, createdService.ID || serviceName);
	} catch (error) {
		primaryError = error;
	} finally {
		const cleanupErrors: Error[] = [];

		if (serviceMayExist) {
			// Collect once after the terminal task state to avoid follower races or duplicates.
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

export const executeBackup = async (input: ExecuteBackupInput) => {
	try {
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
				{ containerId: directContainerId },
			);
			await runHostCommand(input.serverId, command);
			return { mode: "direct" as const };
		}

		await runBackupOnWorker(input);
		return { mode: "swarm-worker" as const };
	} catch (error) {
		await appendBackupError(input.serverId, input.logPath, error);
		throw error;
	}
};
