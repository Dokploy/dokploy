import { createHash } from "node:crypto";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { CreateServiceOptions } from "dockerode";
import { sleep } from "../process/execAsync";
import type { getRemoteDocker } from "../servers/remote-docker";

const BACKUP_WORKER_IMAGE = "docker:28.5.2-cli";
const BACKUP_SCRIPT_PATH = "/run/secrets/dokploy-backup-script";
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_START_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_MISSING_TASK_GRACE_POLLS = 3;

const terminalFailureStates = new Set([
	"failed",
	"rejected",
	"shutdown",
	"orphaned",
	"remove",
]);

export type DockerClient = Awaited<ReturnType<typeof getRemoteDocker>>;

type SwarmTask = {
	ID?: string;
	NodeID?: string;
	Version?: { Index?: number };
	Status?: {
		State?: string;
		Err?: string;
		Message?: string;
		ContainerStatus?: {
			ContainerID?: string;
			ExitCode?: number;
		};
	};
};

type WaitForTaskOptions = {
	missingTaskGracePolls?: number;
	pollIntervalMs?: number;
	startTimeoutMs?: number;
	sleepFn?: (milliseconds: number) => Promise<unknown>;
};

export const getBackupTargetServiceName = (
	backup: BackupSchedule,
): string | null => {
	if (backup.backupType === "database") {
		return (
			backup.postgres?.appName ||
			backup.mysql?.appName ||
			backup.mariadb?.appName ||
			backup.mongo?.appName ||
			backup.libsql?.appName ||
			null
		);
	}

	return null;
};

export const getBackupResourceNames = (executionId: string) => {
	const suffix = createHash("sha256")
		.update(executionId)
		.digest("hex")
		.slice(0, 16);
	const serviceName = `dokploy-backup-${suffix}`;

	return {
		secretName: `${serviceName}-script`,
		serviceName,
	};
};

export const findRunningServiceTask = async (
	docker: DockerClient,
	serviceName: string,
) => {
	const tasks = (await docker.listTasks({
		filters: JSON.stringify({
			service: [serviceName],
			"desired-state": ["running"],
		}),
	})) as SwarmTask[];

	const task = tasks.find(
		(candidate) =>
			candidate.Status?.State === "running" &&
			candidate.NodeID &&
			candidate.Status.ContainerStatus?.ContainerID,
	);

	const nodeId = task?.NodeID;
	const containerId = task?.Status?.ContainerStatus?.ContainerID;
	if (!nodeId || !containerId) {
		throw new Error(
			`No running Swarm task found for database service ${serviceName}`,
		);
	}

	return { containerId, nodeId };
};

const getLatestTask = (tasks: SwarmTask[]) =>
	[...tasks].sort(
		(left, right) => (right.Version?.Index ?? 0) - (left.Version?.Index ?? 0),
	)[0];

const getReplacementTask = (tasks: SwarmTask[], startedTaskId: string) =>
	getLatestTask(tasks.filter((task) => task.ID !== startedTaskId));

const getUniqueTaskAttempts = (tasks: SwarmTask[]) => {
	const seen = new Set<string>();
	return [...tasks]
		.sort(
			(left, right) => (right.Version?.Index ?? 0) - (left.Version?.Index ?? 0),
		)
		.filter((task) => {
			if (!task.ID || seen.has(task.ID)) return false;
			seen.add(task.ID);
			return true;
		});
};

const getTaskSummary = (task: SwarmTask) =>
	`${task.ID ?? "unknown"} (${task.Status?.State ?? "unknown"})`;

const getTaskReplacementMessage = (
	startedTaskId: string,
	replacement: SwarmTask,
) =>
	`Backup worker task ${startedTaskId} was replaced after starting by task ${getTaskSummary(replacement)}`;

const getTaskFailureMessage = (task: SwarmTask) => {
	const state = task.Status?.State ?? "unknown";
	const detail = task.Status?.Err || task.Status?.Message;
	const exitCode = task.Status?.ContainerStatus?.ExitCode;
	const suffix = [
		detail,
		exitCode !== undefined ? `exit code ${exitCode}` : undefined,
	]
		.filter(Boolean)
		.join(", ");

	return `Backup worker task ${state}${suffix ? `: ${suffix}` : ""}`;
};

export const waitForBackupWorkerTask = async (
	docker: DockerClient,
	serviceId: string,
	options: WaitForTaskOptions = {},
) => {
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
	const missingTaskGracePolls = Math.max(
		1,
		options.missingTaskGracePolls ?? DEFAULT_MISSING_TASK_GRACE_POLLS,
	);
	const sleepFn = options.sleepFn ?? sleep;
	const startedAt = Date.now();
	let startedTaskId: string | null = null;
	let missingTaskPolls = 0;

	while (true) {
		const tasks = (await docker.listTasks({
			filters: JSON.stringify({ service: [serviceId] }),
		})) as SwarmTask[];

		if (startedTaskId) {
			const task = tasks.find((candidate) => candidate.ID === startedTaskId);
			const state = task?.Status?.State;

			if (task && state && terminalFailureStates.has(state)) {
				throw new Error(getTaskFailureMessage(task));
			}

			const replacement = getReplacementTask(tasks, startedTaskId);
			if (task && replacement) {
				throw new Error(getTaskReplacementMessage(startedTaskId, replacement));
			}

			if (state === "complete") {
				return;
			}
			if (state === "running") {
				missingTaskPolls = 0;
			} else if (task) {
				throw new Error(
					`Backup worker task ${startedTaskId} entered ${state ?? "an unknown state"} after starting`,
				);
			} else {
				missingTaskPolls += 1;
				if (missingTaskPolls >= missingTaskGracePolls) {
					if (replacement) {
						throw new Error(
							getTaskReplacementMessage(startedTaskId, replacement),
						);
					}
					throw new Error("Backup worker task disappeared after starting");
				}
			}

			await sleepFn(pollIntervalMs);
			continue;
		}

		const taskAttempts = getUniqueTaskAttempts(tasks);
		if (taskAttempts.length > 1) {
			throw new Error(
				`Backup worker service reported multiple task attempts before execution could be tracked: ${taskAttempts.map(getTaskSummary).join(", ")}`,
			);
		}

		const task = getLatestTask(tasks);
		const state = task?.Status?.State;

		if (state === "complete") {
			return;
		}
		if (task && state && terminalFailureStates.has(state)) {
			throw new Error(getTaskFailureMessage(task));
		}
		if (state === "running") {
			if (!task?.ID) {
				throw new Error("Backup worker running task did not provide an ID");
			}
			startedTaskId = task.ID;
		}

		if (!startedTaskId && Date.now() - startedAt >= startTimeoutMs) {
			throw new Error(
				`Backup worker did not start within ${Math.round(startTimeoutMs / 1_000)} seconds`,
			);
		}

		await sleepFn(pollIntervalMs);
	}
};

export const getBackupWorkerServiceSpec = ({
	backupId,
	executionId,
	nodeId,
	secretId,
	secretName,
	serviceName,
}: {
	backupId: string;
	executionId: string;
	nodeId: string;
	secretId: string;
	secretName: string;
	serviceName: string;
}): CreateServiceOptions => {
	const labels = {
		"dokploy.backup.id": backupId,
		"dokploy.deployment.id": executionId,
		"dokploy.managed": "true",
		"dokploy.resource": "database-backup-worker",
	};

	return {
		Name: serviceName,
		Labels: labels,
		TaskTemplate: {
			ContainerSpec: {
				Image: BACKUP_WORKER_IMAGE,
				Command: ["/bin/sh", "-c"],
				Args: [
					`apk add --no-cache bash rclone >/dev/null && exec /bin/bash ${BACKUP_SCRIPT_PATH}`,
				],
				Labels: labels,
				Mounts: [
					{
						Type: "bind",
						Source: "/var/run/docker.sock",
						Target: "/var/run/docker.sock",
					},
				],
				Secrets: [
					{
						SecretID: secretId,
						SecretName: secretName,
						File: {
							Name: BACKUP_SCRIPT_PATH.replace("/run/secrets/", ""),
							UID: "0",
							GID: "0",
							Mode: 0o400,
						},
					},
				],
			},
			LogDriver: {
				Name: "json-file",
				Options: {
					"max-size": "10m",
					"max-file": "1",
				},
			},
			Placement: {
				Constraints: [`node.id==${nodeId}`],
			},
			RestartPolicy: {
				Condition: "none",
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
	};
};
