import { exec } from "node:child_process";
import fs from "node:fs";
import util from "node:util";
import { join } from "node:path";
import console from "node:console";
import { containerLogFile } from "../constants.js";
import type { Container } from "./types.js";
import {
	loadConfig,
	shouldMonitorContainer,
	getContainerConfig,
	getServiceName,
} from "./config.js";
import { processContainerData } from "./utils.js";

export const execAsync = util.promisify(exec);

const config = loadConfig();
const REFRESH_RATE_CONTAINER = Number(
	process.env.CONTAINER_REFRESH_RATE || 10000,
);

export const logContainerMetrics = () => {
	console.log("Initialized container metrics");
	console.log("Refresh rate:", REFRESH_RATE_CONTAINER);

	const cleanup = () => {
		console.log("Cleaning up container metrics");
	};

	setInterval(async () => {
		try {
			const { stdout } = await execAsync(
				'docker stats --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'',
			);

			const jsonString = `[${stdout.trim().split("\n").join(",")}]`;
			const containers: Container[] = JSON.parse(jsonString);

			if (containers.length === 0) {
				return;
			}

			const filteredContainer = containers.filter((container) => {
				const shouldMonitor = shouldMonitorContainer(container.Name, config);
				console.log(
					`Service ${getServiceName(container.Name)} (${container.Name}): ${shouldMonitor ? "monitored" : "filtered out"}`,
				);
				return shouldMonitor;
			});

			console.log(`Monitoring ${filteredContainer.length} containers`);

			for (const container of filteredContainer) {
				try {
					const serviceName = getServiceName(container.Name);
					const containerPath = join(containerLogFile, `${serviceName}.log`);
					const processedData = processContainerData(container);
					const logLine = `${JSON.stringify(processedData)}\n`;
					const containerConfig = getContainerConfig(container.Name, config);

					const { maxFileSizeMB = 10 } = containerConfig;

					if (fs.existsSync(containerPath)) {
						const stats = await fs.promises.stat(containerPath);
						const fileSizeInMB = stats.size / (1024 * 1024);
						if (fileSizeInMB >= maxFileSizeMB) {
							const fileContent = fs.readFileSync(containerPath, "utf-8");
							const lines = fileContent
								.split("\n")
								.filter((line) => line.trim());

							const linesToKeep = Math.floor(lines.length / 2);
							const newContent = `${lines.slice(-linesToKeep).join("\n")}\n`;
							fs.writeFileSync(containerPath, newContent);
						}
					}

					await fs.promises.appendFile(containerPath, logLine);
				} catch (error) {
					console.error(
						`Error writing metrics for container ${container.Name}:`,
						error,
					);
				}
			}
		} catch (error) {
			console.error("Error getting containers:", error);
		}
	}, REFRESH_RATE_CONTAINER);

	return cleanup;
};
