import { createWriteStream } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Schedule } from "@dokploy/server/db/schema/schedule";
import {
	createDeploymentSchedule,
	updateDeployment,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findScheduleById } from "@dokploy/server/services/schedule";
import { scheduledJobs, scheduleJob as scheduleJobNode } from "node-schedule";
import { getComposeContainer, getServiceContainer } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export const scheduleJob = (schedule: Schedule) => {
	const { cronExpression, scheduleId } = schedule;

	scheduleJobNode(scheduleId, cronExpression, async () => {
		await runCommand(scheduleId);
	});
};

export const removeScheduleJob = (scheduleId: string) => {
	const currentJob = scheduledJobs[scheduleId];
	currentJob?.cancel();
};

export const runCommand = async (scheduleId: string) => {
	const {
		application,
		command,
		shellType,
		scheduleType,
		compose,
		serviceName,
		appName,
		serverId,
	} = await findScheduleById(scheduleId);

	const deployment = await createDeploymentSchedule({
		scheduleId,
		title: "Schedule",
		description: "Schedule",
	});

	if (scheduleType === "application" || scheduleType === "compose") {
		let containerId = "";
		let serverId = "";
		if (scheduleType === "application" && application) {
			const container = await getServiceContainer(
				application.appName,
				application.serverId,
			);
			containerId = container?.Id || "";
			serverId = application.serverId || "";
		}
		if (scheduleType === "compose" && compose) {
			const container = await getComposeContainer(compose, serviceName || "");
			containerId = container?.Id || "";
			serverId = compose.serverId || "";
		}

		if (serverId) {
			try {
				await execAsyncRemote(
					serverId,
					`
					set -e
					echo "Running command: docker exec ${containerId} ${shellType} -c '${command}'" >> ${deployment.logPath};
					docker exec ${containerId} ${shellType} -c '${command}' >> ${deployment.logPath} 2>> ${deployment.logPath} || { 
						echo "❌ Command failed" >> ${deployment.logPath};
						exit 1;
					}
					echo "✅ Command executed successfully" >> ${deployment.logPath};
					`,
				);
			} catch (error) {
				await updateDeploymentStatus(deployment.deploymentId, "error");
				throw error;
			}
		} else {
			const writeStream = createWriteStream(deployment.logPath, { flags: "a" });

			try {
				writeStream.write(
					`docker exec ${containerId} ${shellType} -c ${command}\n`,
				);
				await spawnAsync(
					"docker",
					["exec", containerId, shellType, "-c", command],
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
	} else if (scheduleType === "dokploy-server") {
		try {
			const writeStream = createWriteStream(deployment.logPath, { flags: "a" });
			const { SCHEDULES_PATH } = paths();
			const fullPath = path.join(SCHEDULES_PATH, appName || "");

			await spawnAsync(
				"bash",
				["-c", "./script.sh"],
				async (data) => {
					if (writeStream.writable) {
						// we need to extract the PID and Schedule ID from the data
						const pid = data?.match(/PID: (\d+)/)?.[1];

						if (pid) {
							await updateDeployment(deployment.deploymentId, {
								pid,
							});
						}
						writeStream.write(data);
					}
				},
				{
					cwd: fullPath,
				},
			);
		} catch (error) {
			await updateDeploymentStatus(deployment.deploymentId, "error");
			throw error;
		}
	} else if (scheduleType === "server") {
		try {
			const { SCHEDULES_PATH } = paths(true);
			const fullPath = path.join(SCHEDULES_PATH, appName || "");
			const command = `
				set -e
				echo "Running script" >> ${deployment.logPath};
				bash -c ${fullPath}/script.sh 2>&1 | tee -a ${deployment.logPath} || { 
					echo "❌ Command failed" >> ${deployment.logPath};
					exit 1;
				  }
				echo "✅ Command executed successfully" >> ${deployment.logPath};
			`;
			await execAsyncRemote(serverId, command, async (data) => {
				// we need to extract the PID and Schedule ID from the data
				const pid = data?.match(/PID: (\d+)/)?.[1];
				if (pid) {
					await updateDeployment(deployment.deploymentId, {
						pid,
					});
				}
			});
		} catch (error) {
			await updateDeploymentStatus(deployment.deploymentId, "error");
			throw error;
		}
	}
	await updateDeploymentStatus(deployment.deploymentId, "done");
};
