import type Dockerode from "dockerode";
import {
	isUpdateOutOfSequenceError,
	SERVICE_UPDATE_ATTEMPTS,
	type ServiceInspectInfo,
} from "../../utils/docker/swarm-service";
import { ROLLOUT_IN_PROGRESS_STATES } from "./task-status";

export type ScaleRejectionReason =
	| "unsupported_mode"
	| "rollout_in_progress"
	| "replicas_changed"
	| "insufficient_capacity"
	| "deployment_in_progress"
	| "custom_command"
	| "unknown_service"
	| "single_instance"
	| "replicas_stopped"
	| "incompatible"
	| "confirmation_required"
	| "autoscaling_enabled"
	| "autoscaling_changed"
	| "unknown_node";

export class ScaleRejectedError extends Error {
	constructor(
		readonly reason: ScaleRejectionReason,
		message: string,
	) {
		super(message);
		this.name = "ScaleRejectedError";
	}
}

export interface ScaleResult {
	from: number;
	to: number;
	changed: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Changes only the replica count of a replicated Swarm service.
 *
 * The inspected spec is resubmitted as-is apart from `Mode`, without bumping
 * `ForceUpdate`, so running tasks are not replaced. No registry auth is sent:
 * the daemon keeps the pull credentials stored with the service, the same as
 * `docker service scale`.
 */
export const scaleService = async ({
	docker,
	serviceName,
	replicas,
	expectedFrom,
	retryDelayMs = 250,
	allowDuringRollout = false,
}: {
	docker: Dockerode;
	serviceName: string;
	replicas: number;
	expectedFrom?: number;
	retryDelayMs?: number;
	allowDuringRollout?: boolean;
}): Promise<ScaleResult> => {
	if (!Number.isInteger(replicas) || replicas < 0) {
		throw new Error(`Invalid replica count: ${replicas}`);
	}
	const service = docker.getService(serviceName);

	for (let attempt = 1; ; attempt++) {
		const inspect: ServiceInspectInfo = await service.inspect();
		const spec = inspect.Spec;
		const replicated = spec?.Mode?.Replicated;
		if (!replicated) {
			throw new ScaleRejectedError(
				"unsupported_mode",
				`Service ${serviceName} is not in replicated mode`,
			);
		}

		// Any service update overwrites the rollback target and resumes a
		// paused rollout, so never scale in the middle of one.
		const updateState = inspect.UpdateStatus?.State;
		if (
			!allowDuringRollout &&
			updateState &&
			ROLLOUT_IN_PROGRESS_STATES.has(updateState)
		) {
			throw new ScaleRejectedError(
				"rollout_in_progress",
				`A rollout is in progress (${updateState}). Wait for it to finish before scaling.`,
			);
		}

		const from: number = replicated.Replicas ?? 1;
		if (from === replicas) {
			return { from, to: replicas, changed: false };
		}
		if (expectedFrom !== undefined && from !== expectedFrom) {
			throw new ScaleRejectedError(
				"replicas_changed",
				`The replica count changed from ${expectedFrom} to ${from} while scaling. Refresh and try again.`,
			);
		}

		try {
			await service.update({
				_query: { version: inspect.Version.Index },
				_body: {
					...spec,
					Mode: {
						...spec.Mode,
						Replicated: { ...replicated, Replicas: replicas },
					},
				},
			});
			return { from, to: replicas, changed: true };
		} catch (error) {
			if (
				attempt >= SERVICE_UPDATE_ATTEMPTS ||
				!isUpdateOutOfSequenceError(error)
			) {
				throw error;
			}
			await sleep(retryDelayMs * attempt);
		}
	}
};
