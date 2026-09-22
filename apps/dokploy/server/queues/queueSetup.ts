import {
	cancelQueuedDeployments,
	type DeploymentJob,
	type DeploymentTarget,
	executeDeployment,
	failQueuedDeployment,
	IS_CLOUD,
	queueDeployment,
} from "@dokploy/server";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { deploy } from "@/server/utils/deploy";
import { resolveBuildsConcurrency } from "./concurrency";
import { InMemoryQueue } from "./in-memory-queue";

declare global {
	var __dokployDeploymentQueue: InMemoryQueue | undefined;
}

// Next and the web server can evaluate this module independently. Both must use
// the same queue; cloud requests use the deployment API instead.
if (!IS_CLOUD && !globalThis.__dokployDeploymentQueue) {
	globalThis.__dokployDeploymentQueue = new InMemoryQueue({
		resolveConcurrency: resolveBuildsConcurrency,
	});
}
const queue = IS_CLOUD ? undefined : globalThis.__dokployDeploymentQueue;

export const startDeploymentWorker = async () => {
	queue?.process(async (job) => {
		await executeDeployment(job.data);
	});
};

export const enqueueDeployment = async (job: DeploymentJob) => {
	const deployment = await queueDeployment(job);
	const queued = { ...job, deploymentId: deployment.deploymentId };
	try {
		if (IS_CLOUD) {
			await deploy(queued);
		} else {
			if (!queue) throw new Error("Deployment queue is unavailable");
			await queue.add(queued);
		}
		return deployment;
	} catch (error) {
		await failQueuedDeployment(deployment.deploymentId, error);
		throw error;
	}
};

export const getDeploymentJobs = () => queue?.getJobs() ?? Promise.resolve([]);

export const getJobsByApplicationId = async (applicationId: string) =>
	(await getDeploymentJobs()).filter(
		({ data }) =>
			data.applicationType === "application" &&
			data.applicationId === applicationId,
	);

export const getJobsByComposeId = async (composeId: string) =>
	(await getDeploymentJobs()).filter(
		({ data }) =>
			data.applicationType === "compose" && data.composeId === composeId,
	);

if (queue) {
	process.on("SIGTERM", () => {
		void queue.close();
		process.exit(0);
	});
}

const cleanDeploymentQueue = async (target?: DeploymentTarget) => {
	const cancelled = new Set(await cancelQueuedDeployments(target));
	queue?.removeWaiting((data) => cancelled.has(data.deploymentId));
};

export const cleanQueuesByApplication = (applicationId: string) =>
	cleanDeploymentQueue({ applicationType: "application", applicationId });

export const cleanQueuesByCompose = (composeId: string) =>
	cleanDeploymentQueue({ applicationType: "compose", composeId });

export const cleanAllDeploymentQueue = async () => {
	await cleanDeploymentQueue();
	return true;
};

export const killDockerBuild = async (
	type: "application" | "compose",
	serverId: string | null,
) => {
	try {
		if (type === "application") {
			const command = `pkill -2 -f "docker build"`;

			if (serverId) {
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		} else if (type === "compose") {
			const command = `pkill -2 -f "docker compose"`;

			if (serverId) {
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		}
	} catch (error) {
		console.error(error);
	}
};
