import type Dockerode from "dockerode";
import { sleep } from "../process/execAsync";

const DEFAULT_MONITOR_NS = 30_000_000_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_UPDATE_TIMEOUT_MS = 2 * 60 * 1_000;
const UPDATE_TIMEOUT_BUFFER_MS = 60 * 1_000;

type SwarmUpdateConfig = {
	Parallelism?: number;
	Delay?: number;
	Monitor?: number;
};

type SwarmServiceInfo = {
	Version?: { Index?: number };
	UpdateStatus?: {
		State?: string;
		Message?: string;
		StartedAt?: string;
	};
	Spec?: { TaskTemplate?: { ForceUpdate?: number } };
};

type SwarmTask = {
	Version?: { Index?: number };
	Spec?: { ForceUpdate?: number };
	Status?: {
		State?: string;
		Err?: string;
		Message?: string;
		ContainerStatus?: { ExitCode?: number };
	};
};

type WaitForSwarmServiceUpdateOptions = {
	expectedForceUpdate: number;
	pollIntervalMs?: number;
	previousVersion: number;
	sleepFn?: (milliseconds: number) => Promise<unknown>;
	timeoutMs: number;
	nowFn?: () => number;
};

const failedUpdateStates = new Set([
	"paused",
	"rollback_paused",
	"rollback_completed",
]);

const failedTaskStates = new Set(["failed", "rejected", "orphaned"]);

const nanosecondsToMilliseconds = (value: number | undefined) =>
	Math.max(0, value ?? DEFAULT_MONITOR_NS) / 1_000_000;

const getPhaseTimeoutMs = (
	config: SwarmUpdateConfig | undefined,
	replicas: number,
) => {
	const parallelism = Math.max(0, config?.Parallelism ?? 1);
	const batches =
		parallelism === 0
			? 1
			: Math.max(1, Math.ceil(Math.max(1, replicas) / parallelism));
	const monitorMs = nanosecondsToMilliseconds(config?.Monitor);
	const delayMs = Math.max(0, config?.Delay ?? 0) / 1_000_000;

	return batches * monitorMs + Math.max(0, batches - 1) * delayMs;
};

export const getSwarmServiceUpdateTimeoutMs = ({
	replicas,
	rollbackConfig,
	updateConfig,
}: {
	replicas: number;
	rollbackConfig?: SwarmUpdateConfig;
	updateConfig?: SwarmUpdateConfig;
}) => {
	const calculatedTimeout =
		getPhaseTimeoutMs(updateConfig, replicas) +
		getPhaseTimeoutMs(rollbackConfig, replicas) +
		UPDATE_TIMEOUT_BUFFER_MS;

	return Math.max(MIN_UPDATE_TIMEOUT_MS, calculatedTimeout);
};

const getLatestTaskFailure = async (
	docker: Dockerode,
	serviceName: string,
	expectedForceUpdate: number,
) => {
	try {
		const tasks = (await docker.listTasks({
			filters: JSON.stringify({ service: [serviceName] }),
		})) as SwarmTask[];
		const failedTask = tasks
			.filter(
				(task) =>
					task.Spec?.ForceUpdate === expectedForceUpdate &&
					failedTaskStates.has(task.Status?.State ?? ""),
			)
			.sort(
				(left, right) =>
					(right.Version?.Index ?? 0) - (left.Version?.Index ?? 0),
			)[0];

		if (!failedTask) return;

		const detail = failedTask.Status?.Err || failedTask.Status?.Message;
		const exitCode = failedTask.Status?.ContainerStatus?.ExitCode;
		return [
			detail,
			exitCode !== undefined ? `exit code ${exitCode}` : undefined,
		]
			.filter(Boolean)
			.join(", ");
	} catch {
		return;
	}
};

const getUpdateFailureMessage = async (
	docker: Dockerode,
	serviceName: string,
	state: string,
	message: string | undefined,
	expectedForceUpdate: number,
) => {
	const summary =
		state === "rollback_completed"
			? "Swarm service update rolled back"
			: state === "rollback_paused"
				? "Swarm service rollback paused"
				: "Swarm service update paused";
	const taskFailure = await getLatestTaskFailure(
		docker,
		serviceName,
		expectedForceUpdate,
	);

	return `${summary}${message ? `: ${message}` : ""}${
		taskFailure ? `. Latest task failure: ${taskFailure}` : ""
	}`;
};

export const waitForSwarmServiceUpdate = async (
	docker: Dockerode,
	service: Dockerode.Service,
	options: WaitForSwarmServiceUpdateOptions,
) => {
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const sleepFn = options.sleepFn ?? sleep;
	const nowFn = options.nowFn ?? Date.now;
	const startedAt = nowFn();
	let lastState = "pending";
	let operationStartedAt: string | undefined;

	while (nowFn() - startedAt < options.timeoutMs) {
		const inspect = (await service.inspect()) as SwarmServiceInfo;
		const version = inspect.Version?.Index ?? 0;

		if (version > options.previousVersion) {
			const state = inspect.UpdateStatus?.State;
			lastState = state ?? "pending";
			const currentForceUpdate = inspect.Spec?.TaskTemplate?.ForceUpdate;
			const currentOperationStartedAt = inspect.UpdateStatus?.StartedAt;

			if (!operationStartedAt) {
				const isExpectedUpdate =
					currentForceUpdate === options.expectedForceUpdate;
				const isExpectedRollback =
					state?.startsWith("rollback_") &&
					Boolean(
						await getLatestTaskFailure(
							docker,
							service.id,
							options.expectedForceUpdate,
						),
					);

				if (!isExpectedUpdate && !isExpectedRollback) {
					throw new Error(
						"Swarm service update was superseded by another operation",
					);
				}

				operationStartedAt = currentOperationStartedAt;
			} else if (currentOperationStartedAt !== operationStartedAt) {
				throw new Error(
					"Swarm service update was superseded by another operation",
				);
			}

			if (state === "completed") return;
			if (state && failedUpdateStates.has(state)) {
				throw new Error(
					await getUpdateFailureMessage(
						docker,
						service.id,
						state,
						inspect.UpdateStatus?.Message,
						options.expectedForceUpdate,
					),
				);
			}
		}

		await sleepFn(pollIntervalMs);
	}

	throw new Error(
		`Swarm service update did not finish within ${Math.round(options.timeoutMs / 1_000)} seconds (last state: ${lastState})`,
	);
};
