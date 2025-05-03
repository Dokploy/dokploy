import type { Schedule } from "@dokploy/server/db/schema/schedule";
import { findScheduleById } from "@dokploy/server/services/schedule";
import { scheduleJob as scheduleJobNode } from "node-schedule";
import { getComposeContainer, getServiceContainerIV2 } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";
import { createDeploymentSchedule } from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";
import { updateDeploymentStatus } from "@dokploy/server/services/deployment";
import { paths } from "@dokploy/server/constants";
import path from "node:path";

export const scheduleJob = (schedule: Schedule) => {
	const { cronExpression, scheduleId } = schedule;

	scheduleJobNode(cronExpression, async () => {
		await runCommand(scheduleId);
	});
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
			const container = await getServiceContainerIV2(
				application.appName,
				application.serverId,
			);
			containerId = container.Id;
			serverId = application.serverId || "";
		}
		if (scheduleType === "compose" && compose) {
			const container = await getComposeContainer(compose, serviceName || "");
			containerId = container.Id;
			serverId = compose.serverId || "";
		}

		if (serverId) {
			try {
				await execAsyncRemote(
					serverId,
					`
					set -e
					echo "Running command: docker exec ${containerId} ${shellType} -c \"${command}\"" >> ${deployment.logPath};
					docker exec ${containerId} ${shellType} -c "${command}" >> ${deployment.logPath} 2>> ${deployment.logPath} || { 
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
					`docker exec ${containerId} ${shellType} -c "${command}"\n`,
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
				(data) => {
					if (writeStream.writable) {
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
				bash -c ${fullPath}/script.sh >> ${deployment.logPath} 2>> ${deployment.logPath} || { 
					echo "❌ Command failed" >> ${deployment.logPath};
					exit 1;
				  }
				echo "✅ Command executed successfully" >> ${deployment.logPath};
			`;
			await execAsyncRemote(serverId, command);
		} catch (error) {
			await updateDeploymentStatus(deployment.deploymentId, "error");
			throw error;
		}
	}
	await updateDeploymentStatus(deployment.deploymentId, "done");
};
