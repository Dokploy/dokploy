import { type Job, Worker } from "bullmq";
import { myComposeQueue, redisConfig } from "./queueSetup";
import { deployCompose, rebuildCompose } from "../api/services/compose";

interface DeployJob {
	composeId: string;
	titleLog: string;
	type: "deploy" | "redeploy";
}

export type ComposeJob = DeployJob;

export const composeWorker = new Worker(
	"compose",
	async (job: Job<ComposeJob>) => {
		try {
			if (job.data.type === "deploy") {
				await deployCompose({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
				});
			} else if (job.data.type === "redeploy") {
				await rebuildCompose({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
				});
			}
		} catch (error) {
			console.log("Error", error);
		}
	},
	{
		autorun: false,
		connection: redisConfig,
	},
);

export const cleanQueuesByCompose = async (composeId: string) => {
	const jobs = await myComposeQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job.data.composeId === composeId) {
			await job.remove();
			console.log(`Removed job ${job.id} for compose ${composeId}`);
		}
	}
};
