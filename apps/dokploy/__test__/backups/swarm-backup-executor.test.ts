import type { BackupSchedule } from "@dokploy/server/services/backup";
import { executeBackup } from "@dokploy/server/utils/backups/executor";
import {
	BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
	getBackupCommand,
} from "@dokploy/server/utils/backups/utils";
import {
	BackupWorkerPreStartError,
	BackupWorkerTaskError,
	findRunningServiceTask,
	getBackupResourceNames,
	getBackupTargetServiceName,
	getBackupWorkerServiceSpec,
	waitForBackupWorkerTask,
	waitForReplacementServiceTask,
} from "@dokploy/server/utils/backups/worker";
import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	getRemoteDocker: vi.fn(),
	loggerError: vi.fn(),
	loggerInfo: vi.fn(),
	sleep: vi.fn(),
}));

vi.mock("@dokploy/server/lib/logger", () => ({
	logger: {
		error: mocks.loggerError,
		info: mocks.loggerInfo,
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...original,
		execAsync: mocks.execAsync,
		execAsyncRemote: mocks.execAsyncRemote,
		sleep: mocks.sleep,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const containerId = "a".repeat(64);

const postgresBackup = (overrides: Record<string, unknown> = {}) =>
	({
		backupId: "backup-1",
		backupType: "database",
		database: "app",
		databaseType: "postgres",
		postgres: {
			appName: "postgres-service",
			databaseUser: "postgres",
			serverId: null,
		},
		...overrides,
	}) as BackupSchedule;

const databaseBackup = (
	databaseType: "postgres" | "mysql" | "mariadb" | "mongo" | "libsql",
) => {
	const databaseConfig = {
		postgres: { appName: "postgres-service", databaseUser: "postgres" },
		mysql: { appName: "mysql-service", databaseRootPassword: "mysql-pass" },
		mariadb: {
			appName: "mariadb-service",
			databasePassword: "mariadb-pass",
			databaseUser: "mariadb",
		},
		mongo: {
			appName: "mongo-service",
			databasePassword: "mongo-pass",
			databaseUser: "mongo",
		},
		libsql: { appName: "libsql-service" },
	}[databaseType];

	return {
		backupId: `backup-${databaseType}`,
		backupType: "database",
		database: "app",
		databaseType,
		[databaseType]: databaseConfig,
	} as unknown as BackupSchedule;
};

const input = (overrides: Record<string, unknown> = {}) => ({
	backup: postgresBackup(),
	executionId: "deployment-1",
	logPath: "/etc/dokploy/logs/postgres backup.log",
	rcloneDestination: ":s3:backups/postgres.sql.gz",
	rcloneFlags: [
		"--s3-access-key-id=ACCESS_KEY",
		"--s3-secret-access-key=SECRET_KEY",
	],
	...overrides,
});

const runningDatabaseTask = {
	ID: "database-task",
	NodeID: "worker-node-id",
	Status: {
		State: "running",
		ContainerStatus: { ContainerID: containerId },
	},
	Version: { Index: 1 },
};

const createDockerMock = () => {
	const secretRemove = vi.fn().mockResolvedValue(undefined);
	const serviceRemove = vi.fn().mockResolvedValue(undefined);
	const docker = {
		createSecret: vi.fn().mockResolvedValue({ id: "secret-id" }),
		createService: vi.fn().mockResolvedValue({ id: "service-id" }),
		getSecret: vi.fn(() => ({ remove: secretRemove })),
		getService: vi.fn(() => ({ remove: serviceRemove })),
		listTasks: vi
			.fn()
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					ID: "worker-task",
					Status: { State: "complete", ContainerStatus: { ExitCode: 0 } },
					Version: { Index: 2 },
				},
			]),
	};

	return { docker, secretRemove, serviceRemove };
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.sleep.mockResolvedValue(undefined);
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
});

describe("backup worker target and service specification", () => {
	it.each([
		["postgres", "postgres-service"],
		["mysql", "mysql-service"],
		["mariadb", "mariadb-service"],
		["mongo", "mongo-service"],
		["libsql", "libsql-service"],
	] as const)("resolves the %s Swarm service", (databaseType, appName) => {
		const backup = {
			backupType: "database",
			databaseType,
			[databaseType]: { appName },
		} as unknown as BackupSchedule;

		expect(getBackupTargetServiceName(backup)).toBe(appName);
	});

	it("creates deterministic, collision-resistant names per execution", () => {
		const first = getBackupResourceNames("deployment-1");
		const repeated = getBackupResourceNames("deployment-1");
		const retry = getBackupResourceNames("deployment-1", 1);
		const concurrent = getBackupResourceNames("deployment-2");

		expect(first).toEqual(repeated);
		expect(first.serviceName).toMatch(/^dokploy-backup-[a-f0-9]{16}$/);
		expect(first.secretName).toBe(`${first.serviceName}-script`);
		expect(retry.serviceName).not.toBe(first.serviceName);
		expect(concurrent.serviceName).not.toBe(first.serviceName);
	});

	it("chooses the newest running database task", async () => {
		const docker = {
			listTasks: vi.fn().mockResolvedValue([
				{
					...runningDatabaseTask,
					ID: "old-database-task",
					NodeID: "old-node",
					Version: { Index: 1 },
				},
				{
					...runningDatabaseTask,
					ID: "new-database-task",
					NodeID: "new-node",
					Status: {
						State: "running",
						ContainerStatus: { ContainerID: "b".repeat(64) },
					},
					Version: { Index: 2 },
				},
			]),
		};

		await expect(
			findRunningServiceTask(docker as never, "postgres-service"),
		).resolves.toEqual({
			containerId: "b".repeat(64),
			nodeId: "new-node",
		});
	});

	it("waits past a stale full task ID when discovery returned a short ID", async () => {
		const replacementContainerId = "b".repeat(64);
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([runningDatabaseTask])
				.mockResolvedValueOnce([
					{
						...runningDatabaseTask,
						ID: "replacement-database-task",
						NodeID: "new-node",
						Status: {
							State: "running",
							ContainerStatus: { ContainerID: replacementContainerId },
						},
						Version: { Index: 2 },
					},
				]),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await expect(
			waitForReplacementServiceTask(
				docker as never,
				"postgres-service",
				containerId.slice(0, 12),
				{ maxPolls: 2, pollIntervalMs: 0, sleepFn },
			),
		).resolves.toEqual({
			containerId: replacementContainerId,
			nodeId: "new-node",
		});
		expect(sleepFn).toHaveBeenCalledOnce();
	});

	it("bounds the wait for a replacement database task", async () => {
		const docker = {
			listTasks: vi.fn().mockResolvedValue([runningDatabaseTask]),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await expect(
			waitForReplacementServiceTask(
				docker as never,
				"postgres-service",
				containerId,
				{ maxPolls: 2, pollIntervalMs: 0, sleepFn },
			),
		).rejects.toThrow(
			"No replacement Swarm task became ready for database service postgres-service after relocation",
		);
		expect(docker.listTasks).toHaveBeenCalledTimes(2);
		expect(sleepFn).toHaveBeenCalledOnce();
	});

	it("pins a one-shot worker to the database node without exposing credentials", () => {
		const spec = getBackupWorkerServiceSpec({
			backupId: "backup-1",
			executionId: "deployment-1",
			nodeId: "worker-node-id",
			secretId: "secret-id",
			secretName: "worker-script",
			serviceName: "worker-service",
		});
		const taskTemplate = spec.TaskTemplate;
		const containerSpec =
			taskTemplate && "ContainerSpec" in taskTemplate
				? taskTemplate.ContainerSpec
				: undefined;

		expect(spec.Name).toBe("worker-service");
		expect(spec.Mode).toEqual({ Replicated: { Replicas: 1 } });
		expect(spec.TaskTemplate?.Placement?.Constraints).toEqual([
			"node.id==worker-node-id",
		]);
		expect(spec.TaskTemplate?.RestartPolicy?.Condition).toBe("none");
		expect(spec.TaskTemplate?.LogDriver).toEqual({
			Name: "json-file",
			Options: {
				"max-size": "10m",
				"max-file": "1",
			},
		});
		expect(containerSpec?.Mounts).toContainEqual({
			Type: "bind",
			Source: "/var/run/docker.sock",
			Target: "/var/run/docker.sock",
		});
		expect(containerSpec?.Secrets).toContainEqual(
			expect.objectContaining({ SecretID: "secret-id" }),
		);
		expect(containerSpec?.Args).toEqual([
			expect.stringContaining(
				"apk add --no-cache bash rclone >/dev/null || exit 1; exec /bin/bash",
			),
		]);
		expect(JSON.stringify(spec)).not.toContain("ACCESS_KEY");
		expect(JSON.stringify(spec)).not.toContain("SECRET_KEY");
	});
});

describe("backup worker task lifecycle", () => {
	it("waits through scheduling and running until completion", async () => {
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "pending" },
						Version: { Index: 1 },
					},
				])
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "running" },
						Version: { Index: 2 },
					},
				])
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "complete" },
						Version: { Index: 3 },
					},
				]),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				pollIntervalMs: 0,
				sleepFn,
			}),
		).resolves.toBeUndefined();
		expect(sleepFn).toHaveBeenCalledTimes(2);
	});

	it("reports the terminal task error and exit code", async () => {
		const docker = {
			listTasks: vi.fn().mockResolvedValue([
				{
					Status: {
						State: "failed",
						Err: "image pull failed",
						ContainerStatus: { ExitCode: 1 },
					},
					Version: { Index: 1 },
				},
			]),
		};

		const error = await waitForBackupWorkerTask(
			docker as never,
			"service-id",
		).catch((caught) => caught);

		expect(error).toBeInstanceOf(BackupWorkerTaskError);
		expect(error).toMatchObject({
			exitCode: 1,
			state: "failed",
		});
		expect((error as Error).message).toBe(
			"Backup worker task failed: image pull failed, exit code 1",
		);
	});

	it("keeps a pending-task timeout non-retryable", async () => {
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValue([
					{ Status: { State: "pending" }, Version: { Index: 1 } },
				]),
		};

		const error = await waitForBackupWorkerTask(docker as never, "service-id", {
			startTimeoutMs: 0,
		}).catch((caught) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(BackupWorkerPreStartError);
		expect((error as Error).message).toBe(
			"Backup worker did not start within 0 seconds",
		);
	});

	it("does not mark a starting-task timeout as safe to retry", async () => {
		const docker = {
			listTasks: vi.fn().mockResolvedValue([
				{
					ID: "worker-task",
					Status: { State: "starting" },
					Version: { Index: 1 },
				},
			]),
		};

		const error = await waitForBackupWorkerTask(docker as never, "service-id", {
			startTimeoutMs: 0,
		}).catch((caught) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(BackupWorkerPreStartError);
		expect((error as Error).message).toBe(
			"Backup worker did not start within 0 seconds",
		);
	});

	it("fails when a task disappears after it started", async () => {
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "running" },
						Version: { Index: 1 },
					},
				])
				.mockResolvedValue([]),
		};

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				missingTaskGracePolls: 2,
				pollIntervalMs: 0,
				sleepFn: vi.fn().mockResolvedValue(undefined),
			}),
		).rejects.toThrow("Backup worker task disappeared after starting");
	});

	it("fails instead of waiting forever on a replacement pending task", async () => {
		const replacementTask = {
			ID: "replacement-task",
			Status: { State: "pending" },
			Version: { Index: 2 },
		};
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "running" },
						Version: { Index: 1 },
					},
				])
				.mockResolvedValueOnce([replacementTask])
				.mockResolvedValueOnce([replacementTask])
				.mockResolvedValue([
					{
						...replacementTask,
						Status: { State: "failed", Err: "replacement failed" },
						Version: { Index: 3 },
					},
				]),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				missingTaskGracePolls: 2,
				pollIntervalMs: 0,
				sleepFn,
			}),
		).rejects.toThrow(
			"Backup worker task worker-task was replaced after starting by task replacement-task (pending)",
		);
		expect(docker.listTasks).toHaveBeenCalledTimes(3);
		expect(sleepFn).toHaveBeenCalledTimes(2);
	});

	it("fails when a replacement appears beside the task already running", async () => {
		const runningTask = {
			ID: "worker-task",
			Status: { State: "running" },
			Version: { Index: 1 },
		};
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([runningTask])
				.mockResolvedValueOnce([
					runningTask,
					{
						ID: "replacement-task",
						Status: { State: "pending" },
						Version: { Index: 2 },
					},
				]),
		};

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				pollIntervalMs: 0,
				sleepFn: vi.fn().mockResolvedValue(undefined),
			}),
		).rejects.toThrow(
			"Backup worker task worker-task was replaced after starting by task replacement-task (pending)",
		);
	});

	it("detects a replacement that completes between lifecycle polls", async () => {
		const runningTask = {
			ID: "worker-task",
			Status: { State: "running" },
			Version: { Index: 1 },
		};
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([runningTask])
				.mockResolvedValueOnce([
					runningTask,
					{
						ID: "replacement-task",
						Status: { State: "complete" },
						Version: { Index: 2 },
					},
				]),
		};

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				pollIntervalMs: 0,
				sleepFn: vi.fn().mockResolvedValue(undefined),
			}),
		).rejects.toThrow(
			"Backup worker task worker-task was replaced after starting by task replacement-task (complete)",
		);
	});

	it("rejects duplicate completed task attempts", async () => {
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "running" },
						Version: { Index: 1 },
					},
				])
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "complete" },
						Version: { Index: 2 },
					},
					{
						ID: "replacement-task",
						Status: { State: "complete" },
						Version: { Index: 3 },
					},
				]),
		};

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				pollIntervalMs: 0,
				sleepFn: vi.fn().mockResolvedValue(undefined),
			}),
		).rejects.toThrow(
			"Backup worker task worker-task was replaced after starting by task replacement-task (complete)",
		);
	});

	it("fails closed when multiple task attempts exist on the first poll", async () => {
		const docker = {
			listTasks: vi.fn().mockResolvedValue([
				{
					ID: "worker-task",
					Status: { State: "running" },
					Version: { Index: 1 },
				},
				{
					ID: "replacement-task",
					Status: { State: "pending" },
					Version: { Index: 2 },
				},
			]),
		};

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id"),
		).rejects.toThrow(
			"Backup worker service reported multiple task attempts before execution could be tracked: replacement-task (pending), worker-task (running)",
		);
	});

	it("allows one running task to outlive the start timeout", async () => {
		const runningTask = {
			ID: "worker-task",
			Status: { State: "running" },
			Version: { Index: 1 },
		};
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([runningTask])
				.mockResolvedValueOnce([runningTask])
				.mockResolvedValueOnce([runningTask])
				.mockResolvedValueOnce([
					{
						...runningTask,
						Status: { State: "complete" },
						Version: { Index: 2 },
					},
				]),
		};
		const sleepFn = vi.fn().mockResolvedValue(undefined);

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				pollIntervalMs: 0,
				sleepFn,
				startTimeoutMs: 0,
			}),
		).resolves.toBeUndefined();
		expect(sleepFn).toHaveBeenCalledTimes(3);
	});

	it("reports the started task failure instead of following its replacement", async () => {
		const docker = {
			listTasks: vi
				.fn()
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: { State: "running" },
						Version: { Index: 1 },
					},
				])
				.mockResolvedValueOnce([
					{
						ID: "worker-task",
						Status: {
							State: "failed",
							Err: "node lost",
							ContainerStatus: { ExitCode: 1 },
						},
						Version: { Index: 2 },
					},
					{
						ID: "replacement-task",
						Status: { State: "pending" },
						Version: { Index: 3 },
					},
				]),
		};

		await expect(
			waitForBackupWorkerTask(docker as never, "service-id", {
				pollIntervalMs: 0,
				sleepFn: vi.fn().mockResolvedValue(undefined),
			}),
		).rejects.toThrow("Backup worker task failed: node lost, exit code 1");
	});
});

describe("executeBackup", () => {
	it("keeps the existing direct path when the database container is local", async () => {
		const { docker } = createDockerMock();
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.execAsync.mockResolvedValueOnce({
			stdout: `${containerId}\n`,
			stderr: "",
		});

		await expect(executeBackup(input())).resolves.toEqual({ mode: "direct" });

		expect(mocks.execAsync).toHaveBeenCalledTimes(2);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain(
			"Starting backup process",
		);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain(
			`CONTAINER_ID=${containerId};`,
		);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain(
			"docker inspect --format '{{.State.Running}}'",
		);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain(
			"label=com.docker.swarm.service.name",
		);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain("exit 75;");
		expect(docker.createService).not.toHaveBeenCalled();
	});

	it("sanitizes direct backup failures without switching to a worker", async () => {
		const { docker } = createDockerMock();
		const exposedSecret = "notification-secret";
		const credentialBearingCommand = `rclone --s3-secret-access-key=${exposedSecret}`;
		const originalError = new Error(`original error: ${exposedSecret}`);
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.execAsync
			.mockResolvedValueOnce({ stdout: `${containerId}\n`, stderr: "" })
			.mockRejectedValueOnce(
				new ExecError(`direct backup failed: ${credentialBearingCommand}`, {
					command: credentialBearingCommand,
					exitCode: 1,
					stdout: `stdout echoed ${exposedSecret}`,
					stderr: `stderr echoed ${exposedSecret}`,
					originalError,
				}),
			);

		const error = await executeBackup(input()).catch((caught) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(ExecError);
		expect(error).toMatchObject({
			message: "Backup command failed with exit code 1",
		});
		expect(error).not.toHaveProperty("command");
		expect(error).not.toHaveProperty("stdout");
		expect(error).not.toHaveProperty("stderr");
		expect(error).not.toHaveProperty("originalError");
		const publicRepresentation = [
			String(error),
			(error as Error).stack ?? "",
			JSON.stringify(error),
		].join("\n");
		expect(publicRepresentation).not.toContain(exposedSecret);
		const appendedLogCommand =
			mocks.execAsync.mock.calls[mocks.execAsync.mock.calls.length - 1]?.[0];
		expect(appendedLogCommand).toContain(
			"Backup command failed with exit code 1",
		);
		expect(appendedLogCommand).not.toContain(exposedSecret);
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		expect(docker.createService).not.toHaveBeenCalled();
	});

	it("switches to a worker when the direct database task moves away", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		const relocatedContainerId = "b".repeat(64);
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					...runningDatabaseTask,
					ID: "relocated-database-task",
					NodeID: "worker-node-b",
					Status: {
						State: "running",
						ContainerStatus: { ContainerID: relocatedContainerId },
					},
					Version: { Index: 2 },
				},
			])
			.mockResolvedValueOnce([
				{
					ID: "worker-task",
					Status: { State: "complete", ContainerStatus: { ExitCode: 0 } },
					Version: { Index: 3 },
				},
			]);
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.execAsync
			.mockResolvedValueOnce({
				stdout: `${containerId.slice(0, 12)}\n`,
				stderr: "",
			})
			.mockRejectedValueOnce(
				new ExecError("direct database task moved", {
					command: "backup",
					exitCode: BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
				}),
			);

		await expect(executeBackup(input())).resolves.toEqual({
			mode: "swarm-worker",
		});

		expect(docker.createService).toHaveBeenCalledOnce();
		expect(
			docker.createService.mock.calls[0]?.[0].TaskTemplate.Placement
				.Constraints,
		).toEqual(["node.id==worker-node-b"]);
		expect(serviceRemove).toHaveBeenCalledOnce();
		expect(secretRemove).toHaveBeenCalledOnce();
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain("exit 75;");
		expect(mocks.execAsync.mock.calls[0]?.[0]).toContain(
			"docker ps -q --no-trunc",
		);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain(
			"Database container moved before the backup started",
		);
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes(
					"Database task moved off this node before the backup started; switching to a backup worker",
				),
			),
		).toBe(true);
	});

	it("uses the exact worker container and removes all temporary resources", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).resolves.toEqual({
			mode: "swarm-worker",
		});

		const targetFilters = JSON.parse(
			docker.listTasks.mock.calls[0]?.[0].filters,
		);
		expect(targetFilters).toEqual({
			service: ["postgres-service"],
			"desired-state": ["running"],
		});

		const secretSpec = docker.createSecret.mock.calls[0]?.[0];
		const workerScript = Buffer.from(secretSpec.Data, "base64").toString();
		expect(workerScript).toContain(`CONTAINER_ID=${containerId};`);
		expect(workerScript).toContain("/proc/1/fd/1");
		expect(workerScript).toContain(
			"label=com.docker.swarm.service.name=postgres-service",
		);

		const serviceSpec = docker.createService.mock.calls[0]?.[0];
		expect(serviceSpec.TaskTemplate.Placement.Constraints).toEqual([
			"node.id==worker-node-id",
		]);
		expect(serviceSpec.TaskTemplate.ContainerSpec.Secrets).toEqual([
			expect.objectContaining({ SecretID: "secret-id" }),
		]);
		const workerTaskFilters = JSON.parse(
			docker.listTasks.mock.calls[1]?.[0].filters,
		);
		expect(workerTaskFilters).toEqual({ service: ["service-id"] });
		expect(JSON.stringify(serviceSpec)).not.toContain("ACCESS_KEY");
		expect(JSON.stringify(serviceSpec)).not.toContain("SECRET_KEY");
		expect(serviceRemove).toHaveBeenCalledOnce();
		expect(secretRemove).toHaveBeenCalledOnce();
		const serviceLogCommands = mocks.execAsync.mock.calls.filter(([command]) =>
			command.includes("docker service logs --raw"),
		);
		expect(serviceLogCommands).toHaveLength(1);
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes("docker service logs --raw --follow"),
			),
		).toBe(false);
	});

	it("rediscovers the database node and retries once after relocation", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		const relocatedContainerId = "b".repeat(64);
		docker.createSecret
			.mockResolvedValueOnce({ id: "secret-id-a" })
			.mockResolvedValueOnce({ id: "secret-id-b" });
		docker.createService
			.mockResolvedValueOnce({ id: "service-id-a" })
			.mockResolvedValueOnce({ id: "service-id-b" });
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					ID: "worker-task-a",
					Status: {
						State: "failed",
						ContainerStatus: {
							ExitCode: BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
						},
					},
					Version: { Index: 2 },
				},
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					...runningDatabaseTask,
					NodeID: "worker-node-b",
					Status: {
						State: "running",
						ContainerStatus: { ContainerID: relocatedContainerId },
					},
					Version: { Index: 3 },
				},
			])
			.mockResolvedValueOnce([
				{
					ID: "worker-task-b",
					Status: { State: "complete", ContainerStatus: { ExitCode: 0 } },
					Version: { Index: 4 },
				},
			]);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).resolves.toEqual({
			mode: "swarm-worker",
		});

		expect(docker.createSecret).toHaveBeenCalledTimes(2);
		expect(docker.createService).toHaveBeenCalledTimes(2);
		const firstNames = getBackupResourceNames("deployment-1");
		const secondNames = getBackupResourceNames("deployment-1", 1);
		expect(docker.createService.mock.calls[0]?.[0].Name).toBe(
			firstNames.serviceName,
		);
		expect(docker.createService.mock.calls[1]?.[0].Name).toBe(
			secondNames.serviceName,
		);
		expect(docker.getService).toHaveBeenNthCalledWith(
			1,
			firstNames.serviceName,
		);
		expect(docker.getService).toHaveBeenNthCalledWith(
			2,
			secondNames.serviceName,
		);
		expect(docker.getSecret).toHaveBeenNthCalledWith(1, firstNames.secretName);
		expect(docker.getSecret).toHaveBeenNthCalledWith(2, secondNames.secretName);
		expect(
			docker.createService.mock.calls[0]?.[0].TaskTemplate.Placement
				.Constraints,
		).toEqual(["node.id==worker-node-id"]);
		expect(
			docker.createService.mock.calls[1]?.[0].TaskTemplate.Placement
				.Constraints,
		).toEqual(["node.id==worker-node-b"]);
		const firstScript = Buffer.from(
			docker.createSecret.mock.calls[0]?.[0].Data,
			"base64",
		).toString();
		const secondScript = Buffer.from(
			docker.createSecret.mock.calls[1]?.[0].Data,
			"base64",
		).toString();
		expect(firstScript).toContain(`CONTAINER_ID=${containerId};`);
		expect(secondScript).toContain(`CONTAINER_ID=${relocatedContainerId};`);
		expect(serviceRemove).toHaveBeenCalledTimes(2);
		expect(secretRemove).toHaveBeenCalledTimes(2);
		expect(serviceRemove.mock.invocationCallOrder[0]).toBeLessThan(
			docker.listTasks.mock.invocationCallOrder[2] ?? Number.POSITIVE_INFINITY,
		);
		expect(secretRemove.mock.invocationCallOrder[0]).toBeLessThan(
			docker.listTasks.mock.invocationCallOrder[2] ?? Number.POSITIVE_INFINITY,
		);
		expect(mocks.sleep).toHaveBeenCalledOnce();
		expect(
			mocks.execAsync.mock.calls.filter(([command]) =>
				command.includes("docker service logs --raw"),
			),
		).toHaveLength(1);
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes(
					"Database task moved before the backup started; rediscovering its node and retrying",
				),
			),
		).toBe(true);
	});

	it("retries on the replacement node when the first worker cannot start", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		const relocatedContainerId = "b".repeat(64);
		docker.createSecret
			.mockResolvedValueOnce({ id: "secret-id-a" })
			.mockResolvedValueOnce({ id: "secret-id-b" });
		docker.createService
			.mockResolvedValueOnce({ id: "service-id-a" })
			.mockResolvedValueOnce({ id: "service-id-b" });
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					ID: "worker-task-a",
					Status: { State: "rejected", Err: "node unavailable" },
					Version: { Index: 2 },
				},
			])
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					...runningDatabaseTask,
					ID: "relocated-database-task",
					NodeID: "worker-node-b",
					Status: {
						State: "running",
						ContainerStatus: { ContainerID: relocatedContainerId },
					},
					Version: { Index: 3 },
				},
			])
			.mockResolvedValueOnce([
				{
					ID: "worker-task-b",
					Status: { State: "complete", ContainerStatus: { ExitCode: 0 } },
					Version: { Index: 4 },
				},
			]);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).resolves.toEqual({
			mode: "swarm-worker",
		});

		expect(docker.createService).toHaveBeenCalledTimes(2);
		expect(
			docker.createService.mock.calls[0]?.[0].TaskTemplate.Placement
				.Constraints,
		).toEqual(["node.id==worker-node-id"]);
		expect(
			docker.createService.mock.calls[1]?.[0].TaskTemplate.Placement
				.Constraints,
		).toEqual(["node.id==worker-node-b"]);
		expect(serviceRemove).toHaveBeenCalledTimes(2);
		expect(secretRemove).toHaveBeenCalledTimes(2);
		expect(serviceRemove.mock.invocationCallOrder[0]).toBeLessThan(
			docker.listTasks.mock.invocationCallOrder[2] ?? Number.POSITIVE_INFINITY,
		);
		expect(secretRemove.mock.invocationCallOrder[0]).toBeLessThan(
			docker.listTasks.mock.invocationCallOrder[2] ?? Number.POSITIVE_INFINITY,
		);
		expect(mocks.sleep).toHaveBeenCalledOnce();
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes(
					"Database task moved while the backup worker was waiting to start; retrying on its new node",
				),
			),
		).toBe(true);
	});

	it("stops after one relocation retry and cleans both attempts", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		const relocationFailure = {
			Status: {
				State: "failed",
				ContainerStatus: {
					ExitCode: BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
				},
			},
			Version: { Index: 2 },
		};
		docker.createSecret
			.mockResolvedValueOnce({ id: "secret-id-a" })
			.mockResolvedValueOnce({ id: "secret-id-b" });
		docker.createService
			.mockResolvedValueOnce({ id: "service-id-a" })
			.mockResolvedValueOnce({ id: "service-id-b" });
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([relocationFailure])
			.mockResolvedValueOnce([
				{
					...runningDatabaseTask,
					NodeID: "worker-node-b",
					Status: {
						State: "running",
						ContainerStatus: { ContainerID: "b".repeat(64) },
					},
					Version: { Index: 3 },
				},
			])
			.mockResolvedValueOnce([{ ...relocationFailure, Version: { Index: 4 } }]);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"Database task moved while the backup worker was starting; retry limit reached",
		);
		expect(docker.createService).toHaveBeenCalledTimes(2);
		expect(serviceRemove).toHaveBeenCalledTimes(2);
		expect(secretRemove).toHaveBeenCalledTimes(2);
		expect(
			mocks.execAsync.mock.calls.filter(([command]) =>
				command.includes("docker service logs --raw"),
			),
		).toHaveLength(0);
	});

	it("does not retry relocation when cleanup is incomplete", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					Status: {
						State: "failed",
						ContainerStatus: {
							ExitCode: BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
						},
					},
					Version: { Index: 2 },
				},
			]);
		serviceRemove.mockRejectedValue(new Error("cleanup unavailable"));
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"Failed to remove backup worker service: cleanup unavailable",
		);
		expect(docker.createService).toHaveBeenCalledOnce();
		expect(docker.listTasks).toHaveBeenCalledTimes(2);
		expect(serviceRemove).toHaveBeenCalledOnce();
		expect(secretRemove).toHaveBeenCalledOnce();
	});

	it("removes the worker and secret after a failed backup task", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					Status: {
						State: "failed",
						Err: "database command failed",
						ContainerStatus: { ExitCode: 1 },
					},
					Version: { Index: 2 },
				},
			]);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"Backup worker task failed: database command failed, exit code 1",
		);
		expect(serviceRemove).toHaveBeenCalledOnce();
		expect(secretRemove).toHaveBeenCalledOnce();
		expect(docker.createService).toHaveBeenCalledOnce();
		expect(docker.listTasks).toHaveBeenCalledTimes(2);
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes("❌ Error: %s"),
			),
		).toBe(true);
	});

	it("does not hide the backup failure when cleanup also fails", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		docker.listTasks.mockReset();
		docker.listTasks
			.mockResolvedValueOnce([runningDatabaseTask])
			.mockResolvedValueOnce([
				{
					Status: { State: "rejected", Err: "worker rejected" },
					Version: { Index: 2 },
				},
			]);
		serviceRemove.mockRejectedValue(new Error("cleanup unavailable"));
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"Backup worker task rejected: worker rejected",
		);
		expect(secretRemove).toHaveBeenCalledOnce();
		expect(docker.createService).toHaveBeenCalledOnce();
		expect(docker.listTasks).toHaveBeenCalledTimes(2);
		expect(mocks.loggerError).toHaveBeenCalledWith(
			expect.objectContaining({
				errors: expect.arrayContaining([
					"Failed to remove backup worker service: cleanup unavailable",
				]),
			}),
			"Backup worker cleanup also failed",
		);
	});

	it("fails a successful backup if its temporary resources cannot be cleaned", async () => {
		const { docker, serviceRemove } = createDockerMock();
		serviceRemove.mockRejectedValue(new Error("cleanup unavailable"));
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"Failed to remove backup worker service: cleanup unavailable",
		);
	});

	it("keeps a completed backup successful when service logs cannot be read", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.execAsync.mockImplementation(async (command: string) => {
			if (command.includes("docker service logs --raw")) {
				throw new Error("service logging driver cannot be read");
			}
			return { stdout: "", stderr: "" };
		});

		await expect(executeBackup(input())).resolves.toEqual({
			mode: "swarm-worker",
		});
		expect(serviceRemove).toHaveBeenCalledOnce();
		expect(secretRemove).toHaveBeenCalledOnce();
		expect(mocks.loggerError).toHaveBeenCalledWith(
			{ error: "service logging driver cannot be read" },
			"Failed to collect backup worker logs",
		);
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes(
					"⚠️ Warning: Could not collect backup worker logs: service logging driver cannot be read",
				),
			),
		).toBe(true);
	});

	it("fails before creating resources when no running database task exists", async () => {
		const { docker } = createDockerMock();
		docker.listTasks.mockReset();
		docker.listTasks.mockResolvedValue([]);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"No running Swarm task found for database service postgres-service",
		);
		expect(docker.createSecret).not.toHaveBeenCalled();
		expect(docker.createService).not.toHaveBeenCalled();
		expect(
			mocks.execAsync.mock.calls.some(([command]) =>
				command.includes("No running Swarm task found"),
			),
		).toBe(true);
	});

	it("attempts name-based cleanup when service creation loses its response", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		docker.createService.mockRejectedValue(
			new Error("connection dropped after create"),
		);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"connection dropped after create",
		);
		expect(docker.getService).toHaveBeenCalledWith(
			getBackupResourceNames("deployment-1").serviceName,
		);
		expect(serviceRemove).toHaveBeenCalledOnce();
		expect(secretRemove).toHaveBeenCalledOnce();
	});

	it("attempts name-based cleanup when secret creation loses its response", async () => {
		const { docker, secretRemove, serviceRemove } = createDockerMock();
		docker.createSecret.mockRejectedValue(
			new Error("connection dropped after secret create"),
		);
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(executeBackup(input())).rejects.toThrow(
			"connection dropped after secret create",
		);
		expect(docker.getSecret).toHaveBeenCalledWith(
			getBackupResourceNames("deployment-1").secretName,
		);
		expect(secretRemove).toHaveBeenCalledOnce();
		expect(serviceRemove).not.toHaveBeenCalled();
	});

	it("uses the remote manager for discovery, logs, and direct execution", async () => {
		const { docker } = createDockerMock();
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.execAsyncRemote.mockResolvedValueOnce({
			stdout: `${containerId}\n`,
			stderr: "",
		});

		await expect(
			executeBackup(input({ serverId: "remote-server" })),
		).resolves.toEqual({ mode: "direct" });

		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(2);
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("uses the remote manager throughout the worker lifecycle", async () => {
		const { docker } = createDockerMock();
		mocks.getRemoteDocker.mockResolvedValue(docker);

		await expect(
			executeBackup(input({ serverId: "remote-server" })),
		).resolves.toEqual({ mode: "swarm-worker" });

		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("remote-server");
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(3);
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(
			mocks.execAsyncRemote.mock.calls.some(([, command]) =>
				command.includes("docker service logs --raw"),
			),
		).toBe(true);
	});
});

describe("worker backup command safety", () => {
	it.each([
		["postgres", "pg_dump"],
		["mysql", "mysqldump"],
		["mariadb", "mariadb-dump"],
		["mongo", "mongodump"],
		["libsql", "tar cf"],
	] as const)(
		"reuses the existing %s backup pipeline",
		(databaseType, expectedCommand) => {
			const command = getBackupCommand(
				databaseBackup(databaseType),
				["--s3-provider=AWS"],
				":s3:bucket/database.gz",
				"/proc/1/fd/1",
				{ containerId },
			);

			expect(command).toContain(expectedCommand);
			expect(command).toContain(`CONTAINER_ID=${containerId};`);
			expect(command).toContain("rclone rcat");
		},
	);

	it("quotes log paths and validates explicit container IDs", () => {
		const command = getBackupCommand(
			postgresBackup(),
			["--s3-provider=AWS"],
			":s3:backups/postgres.sql.gz",
			"/tmp/log path;touch injected",
			{ containerId },
		);

		expect(command).toContain("'/tmp/log path;touch injected'");
		expect(command).toContain(`CONTAINER_ID=${containerId};`);
		expect(() =>
			getBackupCommand(postgresBackup(), [], ":s3:bucket/file", "/tmp/log", {
				containerId: "$(touch /tmp/injected)",
			}),
		).toThrow("Invalid backup container ID");
	});

	it("uses the relocation exit code only before backup work begins", () => {
		const command = getBackupCommand(
			postgresBackup(),
			["--s3-provider=AWS"],
			":s3:backups/postgres.sql.gz",
			"/proc/1/fd/1",
			{
				containerId,
				containerNotFoundExitCode: BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE,
			},
		);

		expect(command.match(/exit 75;/g)).toHaveLength(1);
		expect(command.match(/exit 1;/g)).toHaveLength(1);
		expect(command).toContain(
			"Database container moved before the backup started",
		);
		expect(command).not.toContain("❌ Error: Container not found");
		expect(command.indexOf("exit 75;")).toBeLessThan(
			command.indexOf("UPLOAD_OUTPUT="),
		);
		expect(command.indexOf("exit 1;")).toBeGreaterThan(
			command.indexOf("UPLOAD_OUTPUT="),
		);
	});

	it("rejects invalid container-not-found exit codes", () => {
		for (const containerNotFoundExitCode of [0, 256, 1.5]) {
			expect(() =>
				getBackupCommand(postgresBackup(), [], ":s3:bucket/file", "/tmp/log", {
					containerId,
					containerNotFoundExitCode,
				}),
			).toThrow("Invalid container-not-found exit code");
		}
	});
});
