import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	findPreviewDeploymentRecordById,
	IS_CLOUD,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import { type Job, Worker } from "bullmq";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";

// CTD fork — deploy-queue resilience for upstream issue #4461: a deploy job that
// hangs (e.g. mechanizeDockerContainer waiting on a preview service that never
// converges after the host saturates) blocks the single serial worker forever,
// stalling ALL deploys (staging + prod) with no recovery but a reboot. Two guards:
//
//  1. DEPLOYMENT_QUEUE_CONCURRENCY (adopted from upstream PR #4273): run N jobs in
//     parallel so one hung job leaves free slots for other deploys. Defaults to 1
//     (original behaviour). Keep it MODEST — high parallelism worsens the OOM that
//     triggers #4461 in the first place.
//  2. DEPLOYMENT_JOB_TIMEOUT_MS: fail a job that exceeds the timeout so its worker
//     slot is reclaimed (BullMQ removeOnFail clears it) instead of hanging forever.
//     The orphaned docker operation may keep running, but the queue self-heals.
const deploymentConcurrency = (() => {
	const n = Number(process.env.DEPLOYMENT_QUEUE_CONCURRENCY);
	return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
})();

const DEFAULT_JOB_TIMEOUT_MS = 45 * 60 * 1000; // 45 min — generous for --no-cache builds
const deploymentJobTimeoutMs = (() => {
	const n = Number(process.env.DEPLOYMENT_JOB_TIMEOUT_MS);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_JOB_TIMEOUT_MS;
})();

/** Reject if `work` does not settle within `ms`, so a hung deploy frees its slot. */
const withTimeout = async <T>(
	work: Promise<T>,
	ms: number,
	label: string,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(new Error(`Deployment job timed out after ${ms}ms (${label})`)),
			ms,
		);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
};

/**
 * Best-effort: mark the deployment target as `error` when its job times out or
 * throws, so the UI does not show it stuck in `running` forever (the #4461
 * symptom). The per-deployment record status is managed inside the deploy
 * functions; this resets the owning entity's status.
 */
const markJobFailed = async (job: Job<DeploymentJob>) => {
	try {
		if (job.data.applicationType === "application") {
			await updateApplicationStatus(job.data.applicationId, "error");
		} else if (job.data.applicationType === "compose") {
			await updateCompose(job.data.composeId, { composeStatus: "error" });
		} else if (job.data.applicationType === "application-preview") {
			await updatePreviewDeployment(job.data.previewDeploymentId, {
				previewStatus: "error",
			});
		}
	} catch (error) {
		console.error("Failed to reset deployment status after job failure", error);
	}
};

const processJob = async (job: Job<DeploymentJob>) => {
	if (job.data.applicationType === "application") {
		await updateApplicationStatus(job.data.applicationId, "running");

		if (job.data.type === "redeploy") {
			await rebuildApplication({
				applicationId: job.data.applicationId,
				titleLog: job.data.titleLog,
				descriptionLog: job.data.descriptionLog,
			});
		} else if (job.data.type === "deploy") {
			await deployApplication({
				applicationId: job.data.applicationId,
				titleLog: job.data.titleLog,
				descriptionLog: job.data.descriptionLog,
			});
		}
	} else if (job.data.applicationType === "compose") {
		await updateCompose(job.data.composeId, {
			composeStatus: "running",
		});
		if (job.data.type === "deploy") {
			await deployCompose({
				composeId: job.data.composeId,
				titleLog: job.data.titleLog,
				descriptionLog: job.data.descriptionLog,
			});
		} else if (job.data.type === "redeploy") {
			await rebuildCompose({
				composeId: job.data.composeId,
				titleLog: job.data.titleLog,
				descriptionLog: job.data.descriptionLog,
			});
		}
	} else if (job.data.applicationType === "application-preview") {
		const previewJob = job.data;
		const previewDeployment = await findPreviewDeploymentRecordById(
			previewJob.previewDeploymentId,
		).catch((error) => {
			console.error(
				"Failed to look up preview deployment before queue execution",
				{
					previewDeploymentId: previewJob.previewDeploymentId,
					applicationId: previewJob.applicationId,
					type: previewJob.type,
					error,
				},
			);
			return null;
		});

		if (!previewDeployment) {
			return;
		}

		await updatePreviewDeployment(previewJob.previewDeploymentId, {
			previewStatus: "running",
		});

		if (previewJob.type === "redeploy") {
			await rebuildPreviewApplication({
				applicationId: previewJob.applicationId,
				titleLog: previewJob.titleLog,
				descriptionLog: previewJob.descriptionLog,
				previewDeploymentId: previewJob.previewDeploymentId,
			});
		} else if (previewJob.type === "deploy") {
			await deployPreviewApplication({
				applicationId: previewJob.applicationId,
				titleLog: previewJob.titleLog,
				descriptionLog: previewJob.descriptionLog,
				previewDeploymentId: previewJob.previewDeploymentId,
			});
		}
	}
};

const createDeploymentWorker = () =>
	new Worker(
		"deployments",
		async (job: Job<DeploymentJob>) => {
			try {
				await withTimeout(
					processJob(job),
					deploymentJobTimeoutMs,
					`${job.data.applicationType}:${job.id ?? "unknown"}`,
				);
			} catch (error) {
				console.log("Error", error);
				await markJobFailed(job);
				throw error;
			}
		},
		{
			autorun: false,
			connection: redisConfig,
			concurrency: deploymentConcurrency,
		},
	);

/** No-op worker when Redis is disabled (e.g. IS_CLOUD). Avoids BullMQ connection errors. */
const noopWorker = {
	run: () => Promise.resolve(),
	close: () => Promise.resolve(),
	cancelJob: () => Promise.resolve(),
	cancelAllJobs: () => Promise.resolve(),
};

export const deploymentWorker = !IS_CLOUD
	? createDeploymentWorker()
	: (noopWorker as unknown as Worker<DeploymentJob>);
