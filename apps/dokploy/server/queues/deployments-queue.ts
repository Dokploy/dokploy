import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	findPreviewDeploymentRecordById,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import type { InMemoryJob } from "./in-memory-queue";

// CTD fork: upstream now supplies per-server concurrency through the in-memory
// queue. Keep only the watchdog that prevents one hung operation from retaining
// its queue partition/group slot forever.
export const DEFAULT_DEPLOYMENT_JOB_TIMEOUT_MS = 45 * 60 * 1000;

export const resolveDeploymentJobTimeoutMs = () => {
	const configured = Number(process.env.DEPLOYMENT_JOB_TIMEOUT_MS);
	return Number.isFinite(configured) && configured > 0
		? Math.floor(configured)
		: DEFAULT_DEPLOYMENT_JOB_TIMEOUT_MS;
};

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
		if (timer) clearTimeout(timer);
	}
};

const markJobFailed = async (job: InMemoryJob) => {
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

const runDeploymentJob = async (job: InMemoryJob) => {
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

		if (!previewDeployment) return;

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

/**
 * Processes a single deployment job. Shared by the per-server in-memory queue
 * and the cloud direct-execution path.
 */
export const processDeploymentJob = async (job: InMemoryJob) => {
	try {
		await withTimeout(
			runDeploymentJob(job),
			resolveDeploymentJobTimeoutMs(),
			`${job.data.applicationType}:${job.id}`,
		);
	} catch (error) {
		await markJobFailed(job);
		throw error;
	}
};
