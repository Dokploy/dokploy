import { db } from "@dokploy/server/db";
import { applications } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import {
	isDockerNotFoundError,
	type ServiceInspectInfo,
} from "../../utils/docker/swarm-service";
import { ensureApplicationTransport } from "../../utils/traefik/vip-transport";
import { assertManualScalingAllowed } from "./autoscaling-policy";
import {
	type CapacityApplication,
	getApplicationCapacity,
	invalidateApplicationCapacity,
} from "./capacity-service";
import {
	MANUAL_TRIGGER,
	recordScalingEvent,
	type ScaleTrigger,
} from "./events";
import { getConfiguredReplicas, getServiceMode } from "./replicas";
import { withScaleLock } from "./scale-lock";
import { ScaleRejectedError, scaleService } from "./scale-service";
import { getScalingDocker, invalidateScalingStatus } from "./status";
import { ROLLOUT_IN_PROGRESS_STATES } from "./task-status";

export interface ManualScaleResult {
	from: number;
	to: number;
	applied: boolean;
	note: string | null;
}

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const capacityShortfall = async (
	application: CapacityApplication,
	replicas: number,
) => {
	try {
		const capacity = await getApplicationCapacity(application, replicas, {
			fresh: true,
		});
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

export const setApplicationReplicas = ({
	application,
	replicas,
	userId,
	acknowledgeWarnings = false,
	trigger = MANUAL_TRIGGER,
}: {
	application: CapacityApplication;
	replicas: number;
	userId: string | null;
	acknowledgeWarnings?: boolean;
	trigger?: ScaleTrigger;
}) =>
	withScaleLock(application.applicationId, async () => {
		if (trigger.source === "manual") {
			await assertManualScalingAllowed({
				kind: "application",
				applicationId: application.applicationId,
			});
		}
		const mode = getServiceMode(application.modeSwarm);
		if (mode !== "replicated") {
			throw new ScaleRejectedError(
				"unsupported_mode",
				`The replica count does not apply to services in ${mode} mode.`,
			);
		}

		const docker = await getScalingDocker(application);
		let live: ServiceInspectInfo | null = null;
		try {
			live = await docker.getService(application.appName).inspect();
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
		const liveReplicas: number | undefined = liveReplicated
			? (liveReplicated.Replicas ?? 1)
			: undefined;

		// A stopped or undeployed service starts with the saved count, without any
		// check, so check here for every count above what is running now.
		const runningNow = live ? liveReplicas : 0;
		const shortfall =
			runningNow !== undefined && replicas > runningNow
				? await capacityShortfall(application, replicas)
				: null;
		if (shortfall && !acknowledgeWarnings) {
			invalidateApplicationCapacity(application.applicationId);
			await recordScalingEvent({
				applicationId: application.applicationId,
				source: trigger.source,
				action: "blocked",
				fromReplicas: runningNow ?? null,
				toReplicas: replicas,
				reason: shortfall,
				userId,
			});
			throw new ScaleRejectedError("insufficient_capacity", shortfall);
		}

		const configuredBefore = getConfiguredReplicas(application);
		// An explicit replicated mode would override the replicas column, so
		// fold it into the column and keep a single source of truth.
		await db
			.update(applications)
			.set({ replicas, modeSwarm: null })
			.where(eq(applications.applicationId, application.applicationId));

		let result: ManualScaleResult;
		if (!live) {
			result = {
				from: configuredBefore,
				to: replicas,
				applied: false,
				note: "The service is not deployed yet. The new count applies on the next deploy.",
			};
		} else if (liveReplicas === undefined) {
			result = {
				from: configuredBefore,
				to: replicas,
				applied: false,
				note: "The running service uses a different mode. Redeploy to apply the new count.",
			};
		} else if (liveReplicas === 0) {
			// Stopped by the user or by a volume backup; scaling now would
			// start the service behind their back.
			result = {
				from: 0,
				to: replicas,
				applied: false,
				note: "The service is stopped. The new count applies when it is started or redeployed.",
			};
		} else {
			try {
				const scaled = await scaleService({
					docker,
					serviceName: application.appName,
					replicas,
					expectedFrom: liveReplicas,
				});
				result = {
					from: scaled.from,
					to: replicas,
					applied: scaled.changed,
					note: null,
				};
			} catch (error) {
				invalidateScalingStatus(application.applicationId);
				invalidateApplicationCapacity(application.applicationId);
				await recordScalingEvent({
					applicationId: application.applicationId,
					source: trigger.source,
					action: "error",
					fromReplicas: liveReplicas,
					toReplicas: replicas,
					reason: errorMessage(error),
					userId,
				});
				throw error;
			}
			if (replicas > 1) {
				await ensureApplicationTransport(
					application.appName,
					application.serverId,
				).catch((error) =>
					console.error(
						`Could not update the Traefik transport of ${application.appName}:`,
						error,
					),
				);
			}
		}

		await recordScalingEvent({
			applicationId: application.applicationId,
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
		invalidateScalingStatus(application.applicationId);
		invalidateApplicationCapacity(application.applicationId);
		return result;
	});
