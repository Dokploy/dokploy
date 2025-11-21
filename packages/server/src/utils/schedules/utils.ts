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
	RecurrenceRule,
	scheduledJobs,
	scheduleJob as scheduleJobNode,
} from "node-schedule";
import { getComposeContainer, getServiceContainer } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

/**
 * Parse cron expression to RecurrenceRule
 * Handles common patterns: specific values, intervals (e.g., star-slash-5), ranges, and lists
 */
const parseCronToRule = (cronExpression: string): RecurrenceRule => {
	const rule = new RecurrenceRule();
	const parts = cronExpression.trim().split(/\s+/);

	if (parts.length < 5) {
		throw new Error(`Invalid cron expression: ${cronExpression}`);
	}

	// Extract parts with type safety
	const minutePart = parts[0];
	const hourPart = parts[1];
	const datePart = parts[2];
	const monthPart = parts[3];
	const dayOfWeekPart = parts[4];

	// Parse minute (0-59)
	if (minutePart && minutePart !== "*") {
		if (minutePart.includes("*/")) {
			const splitResult = minutePart.split("*/");
			const interval = splitResult[1] ? Number.parseInt(splitResult[1], 10) : 1;
			rule.minute = Array.from(
				{ length: Math.floor(60 / interval) },
				(_, i) => i * interval,
			);
		} else if (minutePart.includes(",")) {
			rule.minute = minutePart
				.split(",")
				.map((v) => Number.parseInt(v.trim(), 10));
		} else if (minutePart.includes("-")) {
			const range = minutePart
				.split("-")
				.map((v) => Number.parseInt(v.trim(), 10));
			const start = range[0] ?? 0;
			const end = range[1] ?? 59;
			rule.minute = Array.from(
				{ length: end - start + 1 },
				(_, i) => start + i,
			);
		} else {
			rule.minute = Number.parseInt(minutePart, 10);
		}
	}

	// Parse hour (0-23)
	if (hourPart && hourPart !== "*") {
		if (hourPart.includes("*/")) {
			const splitResult = hourPart.split("*/");
			const interval = splitResult[1] ? Number.parseInt(splitResult[1], 10) : 1;
			rule.hour = Array.from(
				{ length: Math.floor(24 / interval) },
				(_, i) => i * interval,
			);
		} else if (hourPart.includes(",")) {
			rule.hour = hourPart.split(",").map((v) => Number.parseInt(v.trim(), 10));
		} else if (hourPart.includes("-")) {
			const range = hourPart
				.split("-")
				.map((v) => Number.parseInt(v.trim(), 10));
			const start = range[0] ?? 0;
			const end = range[1] ?? 23;
			rule.hour = Array.from({ length: end - start + 1 }, (_, i) => start + i);
		} else {
			rule.hour = Number.parseInt(hourPart, 10);
		}
	}

	// Parse day of month (1-31)
	if (datePart && datePart !== "*") {
		if (datePart.includes("*/")) {
			const splitResult = datePart.split("*/");
			const interval = splitResult[1] ? Number.parseInt(splitResult[1], 10) : 1;
			rule.date = Array.from(
				{ length: Math.floor(31 / interval) },
				(_, i) => (i + 1) * interval,
			);
		} else if (datePart.includes(",")) {
			rule.date = datePart.split(",").map((v) => Number.parseInt(v.trim(), 10));
		} else if (datePart.includes("-")) {
			const range = datePart
				.split("-")
				.map((v) => Number.parseInt(v.trim(), 10));
			const start = range[0] ?? 1;
			const end = range[1] ?? 31;
			rule.date = Array.from({ length: end - start + 1 }, (_, i) => start + i);
		} else {
			rule.date = Number.parseInt(datePart, 10);
		}
	}

	// Parse month (1-12, node-schedule uses 0-11)
	if (monthPart && monthPart !== "*") {
		if (monthPart.includes("*/")) {
			const splitResult = monthPart.split("*/");
			const interval = splitResult[1] ? Number.parseInt(splitResult[1], 10) : 1;
			rule.month = Array.from(
				{ length: Math.floor(12 / interval) },
				(_, i) => i * interval,
			);
		} else if (monthPart.includes(",")) {
			rule.month = monthPart
				.split(",")
				.map((v) => Number.parseInt(v.trim(), 10) - 1);
		} else if (monthPart.includes("-")) {
			const range = monthPart
				.split("-")
				.map((v) => Number.parseInt(v.trim(), 10));
			const start = range[0] ?? 1;
			const end = range[1] ?? 12;
			rule.month = Array.from(
				{ length: end - start + 1 },
				(_, i) => start + i - 1,
			);
		} else {
			rule.month = Number.parseInt(monthPart, 10) - 1;
		}
	}

	// Parse day of week (0-6, where 0 = Sunday)
	if (dayOfWeekPart && dayOfWeekPart !== "*") {
		if (dayOfWeekPart.includes("*/")) {
			const splitResult = dayOfWeekPart.split("*/");
			const interval = splitResult[1] ? Number.parseInt(splitResult[1], 10) : 1;
			rule.dayOfWeek = Array.from(
				{ length: Math.floor(7 / interval) },
				(_, i) => i * interval,
			);
		} else if (dayOfWeekPart.includes(",")) {
			rule.dayOfWeek = dayOfWeekPart
				.split(",")
				.map((v) => Number.parseInt(v.trim(), 10));
		} else if (dayOfWeekPart.includes("-")) {
			const range = dayOfWeekPart
				.split("-")
				.map((v) => Number.parseInt(v.trim(), 10));
			const start = range[0] ?? 0;
			const end = range[1] ?? 6;
			rule.dayOfWeek = Array.from(
				{ length: end - start + 1 },
				(_, i) => start + i,
			);
		} else {
			rule.dayOfWeek = Number.parseInt(dayOfWeekPart, 10);
		}
	}

	return rule;
};

export const scheduleJob = (schedule: Schedule) => {
	const { cronExpression, scheduleId, timezone } = schedule;

	console.log(
		`[Schedule] Scheduling job: ${scheduleId}, cron: ${cronExpression}, timezone: ${timezone || "UTC (default)"}`,
	);

	if (timezone) {
		// Use RecurrenceRule for timezone support
		try {
			const rule = parseCronToRule(cronExpression);
			rule.tz = timezone;

			scheduleJobNode(scheduleId, rule, async () => {
				await runCommand(scheduleId);
			});
		} catch (error) {
			console.error(
				`[Schedule] Failed to parse cron expression with timezone, falling back to UTC: ${cronExpression}`,
				error,
			);
			// Fallback to UTC if parsing fails
			scheduleJobNode(scheduleId, cronExpression, async () => {
				await runCommand(scheduleId);
			});
		}
	} else {
		// No timezone - use string cron (UTC default)
		scheduleJobNode(scheduleId, cronExpression, async () => {
			await runCommand(scheduleId);
		});
	}
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
