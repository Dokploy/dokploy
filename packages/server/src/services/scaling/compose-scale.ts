import { db } from "@dokploy/server/db";
import {
	type ComposeServicePlacement,
	compose as composeTable,
} from "@dokploy/server/db/schema";
import type { ContainerInfo } from "dockerode";
import { eq } from "drizzle-orm";
import {
	isDockerNotFoundError,
	type ServiceInspectInfo,
} from "../../utils/docker/swarm-service";
import { assertManualScalingAllowed } from "./autoscaling-policy";
import {
	getStackServiceCapacity,
	invalidateStackServiceCapacity,
} from "./capacity-service";
import {
	describeComposeService,
	findComposeReplicaOverrides,
	readServicePlacement,
	saveComposePlacementOverride,
	saveComposeReplicaOverride,
} from "./compose-overrides";
import {
	composeSnapshotArgs,
	readComposeSnapshot,
	runDockerCli,
	writeSnapshotReplicas,
} from "./compose-snapshot";
import {
	invalidateComposeScalingStatus,
	type ScalableCompose,
	stackServiceName,
} from "./compose-status";
import {
	MANUAL_TRIGGER,
	recordScalingEvent,
	type ScaleTrigger,
} from "./events";
import type { ManualScaleResult } from "./manual-scale";
import { clearNodeSelection, syncNodeSelection } from "./node-selection";
import { composeScaleLockKey, isDeploying, withScaleLock } from "./scale-lock";
import { ScaleRejectedError, scaleService } from "./scale-service";
import { selectionLabelFor } from "./scaling-settings";
import { getScalingDocker } from "./status";
import { ROLLOUT_IN_PROGRESS_STATES } from "./task-status";

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const rejectWhileDeploying = async (compose: ScalableCompose) => {
	if (
		compose.composeStatus === "running" ||
		(await isDeploying(composeScaleLockKey(compose.composeId)))
	) {
		throw new ScaleRejectedError(
			"deployment_in_progress",
			"A deployment is in progress. Try again once it finishes.",
		);
	}
};

const saveOnly = (
	from: number,
	to: number,
	note: string,
): ManualScaleResult => ({
	from,
	to,
	applied: false,
	note,
});

const stackCapacityShortfall = async (
	compose: ScalableCompose,
	swarmName: string,
	replicas: number,
) => {
	try {
		const capacity = await getStackServiceCapacity(
			compose,
			swarmName,
			replicas,
			{
				fresh: true,
			},
		);
		if (capacity.fit !== "insufficient") return null;
		return (
			capacity.warnings.find(
				(warning) =>
					warning.code === "insufficient_capacity" ||
					warning.code === "no_eligible_nodes",
			)?.message ?? "The requested replicas do not fit on the eligible nodes."
		);
	} catch (error) {
		// The estimate is advisory; failing to read node inventory must not
		// block a scale that Swarm itself may still be able to place.
		console.error("Capacity estimate failed", error);
		return null;
	}
};

const scaleStackService = async ({
	compose,
	serviceName,
	replicas,
	configuredBefore,
	userId,
	acknowledgeWarnings,
	trigger,
}: {
	compose: ScalableCompose;
	serviceName: string;
	replicas: number;
	configuredBefore: number;
	userId: string | null;
	acknowledgeWarnings: boolean;
	trigger: ScaleTrigger;
}): Promise<{ result: ManualScaleResult; shortfall: string | null }> => {
	const docker = await getScalingDocker(compose);
	const swarmName = stackServiceName(compose.appName, serviceName);
	let live: ServiceInspectInfo | null = null;
	try {
		live = await docker.getService(swarmName).inspect();
	} catch (error) {
		if (!isDockerNotFoundError(error)) throw error;
	}

	const updateState: string | undefined = live?.UpdateStatus?.State;
	if (updateState && ROLLOUT_IN_PROGRESS_STATES.has(updateState)) {
		throw new ScaleRejectedError(
			"rollout_in_progress",
			`A rollout is in progress (${updateState}). Wait for it to finish before scaling.`,
		);
	}
	const liveReplicated = live?.Spec?.Mode?.Replicated;
	if (live && !liveReplicated) {
		throw new ScaleRejectedError(
			"unsupported_mode",
			"The running service is not in replicated mode.",
		);
	}
	const liveReplicas: number = liveReplicated?.Replicas ?? (live ? 1 : 0);

	const shortfall =
		replicas > liveReplicas
			? await stackCapacityShortfall(compose, swarmName, replicas)
			: null;
	if (shortfall && !acknowledgeWarnings) {
		await recordScalingEvent({
			composeId: compose.composeId,
			serviceName,
			source: trigger.source,
			action: "blocked",
			fromReplicas: liveReplicas,
			toReplicas: replicas,
			reason: shortfall,
			userId,
		});
		throw new ScaleRejectedError("insufficient_capacity", shortfall);
	}

	await saveComposeReplicaOverride({
		composeId: compose.composeId,
		serviceName,
		replicas,
	});

	// The status is bookkeeping and can drift from Swarm (a Stop that did not
	// reach every service, a deploy interrupted by a restart). Live replicas
	// win over an "idle" status.
	const runningWhileIdle =
		compose.composeStatus === "idle" && !!live && liveReplicas > 0;
	if ((compose.composeStatus !== "done" && !runningWhileIdle) || !live) {
		return {
			result: saveOnly(
				configuredBefore,
				replicas,
				compose.composeStatus === "error"
					? "The last deployment failed. The new count applies on the next deploy."
					: "The stack is not running. The new count applies on the next deploy.",
			),
			shortfall,
		};
	}
	if (liveReplicas === 0) {
		// Scaled to 0 by a volume backup; it restores its own count when done.
		return {
			result: saveOnly(
				0,
				replicas,
				"The service is stopped. The new count applies on the next deploy.",
			),
			shortfall,
		};
	}

	try {
		const scaled = await scaleService({
			docker,
			serviceName: swarmName,
			replicas,
			expectedFrom: liveReplicas,
		});
		if (runningWhileIdle && replicas > 0) {
			await db
				.update(composeTable)
				.set({ composeStatus: "done" })
				.where(eq(composeTable.composeId, compose.composeId));
		}
		return {
			result: {
				from: scaled.from,
				to: replicas,
				applied: scaled.changed,
				note: null,
			},
			shortfall,
		};
	} catch (error) {
		await recordScalingEvent({
			composeId: compose.composeId,
			serviceName,
			source: trigger.source,
			action: "error",
			fromReplicas: liveReplicas,
			toReplicas: replicas,
			reason: errorMessage(error),
			userId,
		});
		throw error;
	} finally {
		invalidateStackServiceCapacity(compose.composeId, swarmName);
	}
};

const scalePlainComposeService = async ({
	compose,
	serviceName,
	replicas,
	configuredBefore,
	userId,
	trigger,
}: {
	compose: ScalableCompose;
	serviceName: string;
	replicas: number;
	configuredBefore: number;
	userId: string | null;
	trigger: ScaleTrigger;
}): Promise<ManualScaleResult> => {
	const snapshot = await readComposeSnapshot(compose);
	const service = snapshot?.spec.services?.[serviceName];
	if (snapshot && !service) {
		throw new ScaleRejectedError(
			"unknown_service",
			`The last deployment has no service named "${serviceName}".`,
		);
	}
	const description = service
		? describeComposeService(service, "docker-compose")
		: null;
	if (description && description.mode !== "replicated") {
		throw new ScaleRejectedError(
			"unsupported_mode",
			`The replica count does not apply to services in ${description.mode} mode.`,
		);
	}
	if (replicas > 1 && description?.singleInstanceReasons.length) {
		throw new ScaleRejectedError(
			"single_instance",
			`This service can only run one container. ${description.singleInstanceReasons.join(" ")}`,
		);
	}

	const docker = await getScalingDocker(compose);
	const containers: ContainerInfo[] =
		compose.composeStatus === "done" && snapshot
			? (
					await docker.listContainers({
						all: true,
						filters: JSON.stringify({
							label: [
								`com.docker.compose.project=${compose.appName}`,
								`com.docker.compose.service=${serviceName}`,
							],
						}),
					})
				).filter(
					(container) =>
						container.Labels?.["com.docker.compose.oneoff"] !== "True",
				)
			: [];
	// `up --scale` also starts stopped containers of the service, which would
	// undo a volume backup's stop or a replica someone stopped on purpose.
	const stoppedContainers = containers.filter(
		(container) => container.State !== "running",
	);
	if (stoppedContainers.length > 0) {
		throw new ScaleRejectedError(
			"replicas_stopped",
			`${stoppedContainers.length} container(s) of this service are not running (for example during a volume backup). Start them or wait, then scale again.`,
		);
	}

	await saveComposeReplicaOverride({
		composeId: compose.composeId,
		serviceName,
		replicas,
	});

	if (compose.composeStatus === "error") {
		return saveOnly(
			configuredBefore,
			replicas,
			"The last deployment failed. The new count applies on the next deploy.",
		);
	}
	if (compose.composeStatus !== "done") {
		return saveOnly(
			configuredBefore,
			replicas,
			"The compose is not running. The new count applies when it is started or deployed.",
		);
	}
	if (!snapshot) {
		return saveOnly(
			configuredBefore,
			replicas,
			"Saved. Deploy once so Dokploy can scale this compose live; the new count applies on that deploy.",
		);
	}

	const from = containers.length;
	try {
		await runDockerCli(compose, snapshot, [
			...composeSnapshotArgs(compose, snapshot),
			"up",
			"-d",
			"--no-deps",
			"--no-recreate",
			"--no-build",
			"--pull",
			"never",
			"--scale",
			`${serviceName}=${replicas}`,
			serviceName,
		]);
	} catch (error) {
		await recordScalingEvent({
			composeId: compose.composeId,
			serviceName,
			source: trigger.source,
			action: "error",
			fromReplicas: from,
			toReplicas: replicas,
			reason: errorMessage(error),
			userId,
		});
		throw error;
	}
	await writeSnapshotReplicas(compose, snapshot, serviceName, replicas);
	return { from, to: replicas, applied: from !== replicas, note: null };
};

export const setComposeServiceReplicas = async ({
	compose,
	serviceName,
	replicas,
	userId,
	acknowledgeWarnings = false,
	trigger = MANUAL_TRIGGER,
	guard,
}: {
	compose: ScalableCompose;
	serviceName: string;
	replicas: number;
	userId: string | null;
	acknowledgeWarnings?: boolean;
	trigger?: ScaleTrigger;
	guard?: () => Promise<void>;
}): Promise<ManualScaleResult> => {
	if (trigger.source === "manual") {
		await assertManualScalingAllowed({
			kind: "compose",
			composeId: compose.composeId,
			serviceName,
		});
	}
	if (compose.command) {
		throw new ScaleRejectedError(
			"custom_command",
			"This compose deploys with a custom command, so Dokploy cannot scale it. Set replicas in the compose file instead.",
		);
	}
	await rejectWhileDeploying(compose);
	const key = composeScaleLockKey(compose.composeId);
	return withScaleLock(key, async () => {
		await guard?.();
		// A deploy may have been queued while this request waited for the lock.
		await rejectWhileDeploying(compose);
		const overrides = await findComposeReplicaOverrides(compose.composeId);
		const snapshot = await readComposeSnapshot(compose);
		const fileService = snapshot?.spec.services?.[serviceName];
		const configuredBefore =
			overrides.find((override) => override.serviceName === serviceName)
				?.replicas ??
			(fileService
				? describeComposeService(fileService, compose.composeType).fileReplicas
				: 1);

		let result: ManualScaleResult;
		let shortfall: string | null = null;
		try {
			if (compose.composeType === "stack") {
				({ result, shortfall } = await scaleStackService({
					compose,
					serviceName,
					replicas,
					configuredBefore,
					userId,
					acknowledgeWarnings,
					trigger,
				}));
			} else {
				result = await scalePlainComposeService({
					compose,
					serviceName,
					replicas,
					configuredBefore,
					userId,
					trigger,
				});
			}
		} finally {
			invalidateComposeScalingStatus(compose.composeId);
		}

		await recordScalingEvent({
			composeId: compose.composeId,
			serviceName,
			source: trigger.source,
			action: !result.applied
				? "set"
				: replicas > result.from
					? "scale_up"
					: "scale_down",
			fromReplicas: result.from,
			toReplicas: replicas,
			reason: trigger.reason ?? result.note,
			userId,
			details: {
				applied: result.applied,
				configuredBefore,
				capacityShortfallAcknowledged: shortfall,
				...(trigger.reason && { note: result.note }),
				...trigger.details,
			},
		});
		return result;
	});
};

/**
 * Saves where a Stack service may run. Like a replica count it is written
 * into the compose file on the next deploy; changing placement live would
 * replace every task.
 */
export const updateComposeServicePlacement = async ({
	compose,
	serviceName,
	placement: input,
	userId,
}: {
	compose: ScalableCompose;
	serviceName: string;
	placement: ComposeServicePlacement & { nodeIds?: string[] };
	userId: string | null;
}) => {
	if (compose.composeType !== "stack") {
		throw new ScaleRejectedError(
			"unsupported_mode",
			"Placement applies to Stack services; Docker Compose runs every container on this server.",
		);
	}
	const label = selectionLabelFor(
		stackServiceName(compose.appName, serviceName),
	);
	const { nodeIds = [], ...choice } = input;
	const placement: ComposeServicePlacement = {
		...choice,
		selectionLabel: choice.nodeTarget === "nodes" ? label : null,
	};
	return withScaleLock(composeScaleLockKey(compose.composeId), async () => {
		const [overrides, snapshot] = await Promise.all([
			findComposeReplicaOverrides(compose.composeId),
			readComposeSnapshot(compose),
		]);
		const service = snapshot?.spec.services?.[serviceName];
		const previous = overrides.find(
			(override) => override.serviceName === serviceName,
		)?.placement;
		const before = readServicePlacement(service, previous);
		if (placement.nodeTarget === "nodes") {
			await syncNodeSelection({ target: compose, label, nodeIds });
		}
		await saveComposePlacementOverride({
			composeId: compose.composeId,
			serviceName,
			placement,
		});
		if (
			placement.nodeTarget !== "nodes" &&
			previous?.selectionLabel === label
		) {
			await clearNodeSelection(compose, label);
		}
		const after = readServicePlacement(service, placement);
		await recordScalingEvent({
			composeId: compose.composeId,
			serviceName,
			source: "manual",
			action: "policy_change",
			reason: "Placement updated. Applies on the next deploy.",
			userId,
			details: { setting: "placement", before, after },
		});
		invalidateComposeScalingStatus(compose.composeId);
		invalidateStackServiceCapacity(
			compose.composeId,
			stackServiceName(compose.appName, serviceName),
		);
		return after;
	});
};
