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
import { quote } from "shell-quote";
import { getComposeContainer, getServiceContainer } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

// Allowlist of permitted shell types
const ALLOWED_SHELL_TYPES = ["sh", "bash", "ash", "dash"];

/**
 * Validates that the shell type is in the allowlist
 */
function validateShellType(shellType: string): void {
	if (!ALLOWED_SHELL_TYPES.includes(shellType)) {
		throw new Error(
			`Invalid shell type: ${shellType}. Allowed types: ${ALLOWED_SHELL_TYPES.join(", ")}`,
		);
	}
}

/**
 * Validates that the container ID is a valid format (alphanumeric and some special chars)
 */
function validateContainerId(containerId: string): void {
	if (!containerId || !/^[a-zA-Z0-9_-]+$/.test(containerId)) {
		throw new Error(`Invalid container ID: ${containerId}`);
	}
}

/**
 * Validates that the command is not empty
 */
function validateCommand(command: string): void {
	if (!command || command.trim().length === 0) {
		throw new Error("Command cannot be empty");
	}
}

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

		// Validate inputs to prevent command injection
		validateContainerId(containerId);
		validateShellType(shellType);
		validateCommand(command);

		// Use shell-quote to safely escape the command
		const escapedCommand = quote([command]);

		if (serverId) {
			try {
				// Use shell-quote to safely escape all parameters
				const escapedLogPath = quote([deployment.logPath]);
				await execAsyncRemote(
					serverId,
					`
					set -e
					echo "Running command: docker exec ${containerId} ${shellType} -c ${escapedCommand}" >> ${escapedLogPath};
					docker exec ${containerId} ${shellType} -c ${escapedCommand} >> ${escapedLogPath} 2>> ${escapedLogPath} || { 
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
					`docker exec ${containerId} ${shellType} -c ${escapedCommand}\n`,
				);
				// spawnAsync uses an array of arguments, which is safe from injection
				// The command is passed as a separate argument, not interpolated
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
