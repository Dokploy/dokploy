import type { Schedule } from "@dokploy/server/db/schema/schedule";
import { findScheduleById } from "@dokploy/server/services/schedule";
import { scheduleJob as scheduleJobNode } from "node-schedule";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";
import { createDeploymentSchedule } from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";
import { updateDeploymentStatus } from "@dokploy/server/services/deployment";
export const scheduleJob = (schedule: Schedule) => {
	const { cronExpression, scheduleId } = schedule;

	scheduleJobNode(cronExpression, async () => {
		await runCommand(scheduleId);
	});
};

export const runCommand = async (scheduleId: string) => {
	const { application, command } = await findScheduleById(scheduleId);

	const isServer = !!application.serverId;

	const { Id: containerId } = isServer
		? await getRemoteServiceContainer(
				application.serverId || "",
				application.appName,
			)
		: await getServiceContainer(application.appName);

	const deployment = await createDeploymentSchedule({
		scheduleId,
		title: "Schedule",
		description: "Schedule",
	});

	if (isServer) {
		try {
			await execAsyncRemote(
				application.serverId,
				`
                set -e
                docker exec ${containerId} sh -c "${command}" || { 
                    echo "❌ Command failed" >> ${deployment.logPath};
                    exit 1;
                }
                `,
			);
		} catch (error) {
			await updateDeploymentStatus(deployment.deploymentId, "error");
			throw error;
		}
	} else {
		const writeStream = createWriteStream(deployment.logPath, { flags: "a" });

		try {
			writeStream.write(`${command}\n`);
			await spawnAsync(
				"docker",
				["exec", containerId, "sh", "-c", command],
				(data) => {
					if (writeStream.writable) {
						writeStream.write(data);
					}
				},
			);

			writeStream.write("✅ Command executed successfully\n");
		} catch (error) {
			writeStream.write("❌ Command failed\n");
			writeStream.write(
				error instanceof Error ? error.message : "Unknown error",
			);
			writeStream.end();
			await updateDeploymentStatus(deployment.deploymentId, "error");
			throw error;
		}
	}

	await updateDeploymentStatus(deployment.deploymentId, "done");
};
