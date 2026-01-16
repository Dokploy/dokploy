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
import {
	shEscape,
	validateContainerId,
	validateShellType,
} from "@dokploy/server/utils/security/shell-escape";
import { validateLogPath } from "@dokploy/server/utils/security/path-validation";
import { scheduledJobs, scheduleJob as scheduleJobNode } from "node-schedule";
import { getComposeContainer, getServiceContainer } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export const scheduleJob = (schedule: Schedule) => {
	const { cronExpression, scheduleId, timezone } = schedule;

	// Use timezone from schedule, default to UTC if not specified
	const tz = timezone || "UTC";

	scheduleJobNode(
		scheduleId,
		{
			tz,
			rule: cronExpression,
		},
		async () => {
			await runCommand(scheduleId);
		},
	);
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

		// Validate inputs
		if (!validateContainerId(containerId)) {
			throw new Error(`Invalid container ID: ${containerId}`);
		}
		if (!validateShellType(shellType || "")) {
			throw new Error(`Invalid shell type: ${shellType}`);
		}
		if (!validateLogPath(deployment.logPath, serverId || null)) {
			throw new Error(`Invalid log path: ${deployment.logPath}`);
		}

		if (serverId) {
			try {
				// Escape all variables for safe shell execution
				const escapedContainerId = shEscape(containerId);
				const escapedShellType = shEscape(shellType);
				const escapedCommand = shEscape(command);
				const escapedLogPath = shEscape(deployment.logPath);

				await execAsyncRemote(
					serverId,
					`
					set -e
					echo "Running command: docker exec ${escapedContainerId} ${escapedShellType} -c ${escapedCommand}" >> ${escapedLogPath};
					docker exec ${escapedContainerId} ${escapedShellType} -c ${escapedCommand} >> ${escapedLogPath} 2>> ${escapedLogPath} || { 
						echo "❌ Command failed" >> ${escapedLogPath};
						exit 1;
					}
					echo "✅ Command executed successfully" >> ${escapedLogPath};
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
					`docker exec ${containerId} ${shellType} -c ${shEscape(command)}\n`,
				);
				// spawnAsync with array arguments is safe - no shell interpretation
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
			// Validate log path
			if (!validateLogPath(deployment.logPath, serverId || null)) {
				throw new Error(`Invalid log path: ${deployment.logPath}`);
			}

			const { SCHEDULES_PATH } = paths(true);
			const fullPath = path.join(SCHEDULES_PATH, appName || "");

			// Escape paths and log path for safe shell execution
			const escapedFullPath = shEscape(fullPath);
			const escapedLogPath = shEscape(deployment.logPath);

			const command = `
				set -e
				echo "Running script" >> ${escapedLogPath};
				bash -c ${escapedFullPath}/script.sh 2>&1 | tee -a ${escapedLogPath} || { 
					echo "❌ Command failed" >> ${escapedLogPath};
					exit 1;
				  }
				echo "✅ Command executed successfully" >> ${escapedLogPath};
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
