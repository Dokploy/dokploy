import { IS_CLOUD } from "@dokploy/server";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import type { Job } from "bullmq";
import { Queue } from "bullmq";
import { deploymentWorker } from "./deployments-queue";
import { redisConfig } from "./redis-connection";

/** No-op queue when Redis is disabled (e.g. IS_CLOUD). Avoids BullMQ connection errors. */
const createNoopQueue = () => ({
	getJobs: () => Promise.resolve([] as Job[]),
	add: () =>
		Promise.resolve({ id: "noop", remove: () => Promise.resolve() } as Job),
	close: () => Promise.resolve(),
	on: () => {},
});

const myQueue = !IS_CLOUD
	? new Queue("deployments", { connection: redisConfig })
	: (createNoopQueue() as unknown as Queue);

export const getJobsByApplicationId = async (applicationId: string) => {
	const jobs = await myQueue.getJobs();
	return jobs.filter((job) => job?.data?.applicationId === applicationId);
};

export const getJobsByComposeId = async (composeId: string) => {
	const jobs = await myQueue.getJobs();
	return jobs.filter((job) => job?.data?.composeId === composeId);
};

if (!IS_CLOUD) {
	process.on("SIGTERM", () => {
		myQueue.close();
		process.exit(0);
	});

	myQueue.on("error", (error) => {
		if ((error as any).code === "ECONNREFUSED") {
			console.error(
				"Make sure you have installed Redis and it is running.",
				error,
			);
		}
	});
}

export const cleanQueuesByApplication = async (applicationId: string) => {
	const jobs = await myQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job?.data?.applicationId === applicationId) {
			await job.remove();
			console.log(`Removed job ${job.id} for application ${applicationId}`);
		}
	}
};

export const cleanAllDeploymentQueue = async () => {
	deploymentWorker.cancelAllJobs("User requested cancellation");
	return true;
};

export const cleanQueuesByCompose = async (composeId: string) => {
	const jobs = await myQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job?.data?.composeId === composeId) {
			await job.remove();
			console.log(`Removed job ${job.id} for compose ${composeId}`);
		}
	}
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

export { myQueue };
