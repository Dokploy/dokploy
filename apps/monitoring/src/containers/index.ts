import { exec } from "node:child_process";
import fs from "node:fs";
import util from "node:util";
import { join } from "node:path";
import console from "node:console";
import { containerLogFile } from "../constants.js";
import type { Container } from "./types.js";
import {
	shouldMonitorContainer,
	getContainerConfig,
	getServiceName,
} from "./config.js";
import { processContainerData } from "./utils.js";

export const execAsync = util.promisify(exec);

const REFRESH_RATE_CONTAINER = Number(
	process.env.CONTAINER_REFRESH_RATE || 10000,
);

export const logContainerMetrics = () => {
	console.log("Initialized container metrics");
	console.log("Refresh rate:", REFRESH_RATE_CONTAINER);

	// Logging de memoria inicial
	const formatMemoryUsage = (data: number) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`;
	const memoryData = process.memoryUsage();
	console.log({
		rss: `${formatMemoryUsage(memoryData.rss)} -> Resident Set Size - total memory allocated`,
		heapTotal: `${formatMemoryUsage(memoryData.heapTotal)} -> Total Size of the Heap`,
		heapUsed: `${formatMemoryUsage(memoryData.heapUsed)} -> Actual Memory Used`,
		external: `${formatMemoryUsage(memoryData.external)} -> External Memory`
	});

	const cleanup = () => {
		console.log("Cleaning up container metrics");
	};

	setInterval(async () => {
		try {
			// Log memoria antes de la operación
			console.log("Memory before docker stats:", formatMemoryUsage(process.memoryUsage().heapUsed));

			const { stdout } = await execAsync(
				'docker stats --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'',
			);

			// Log memoria después de docker stats
			console.log("Memory after docker stats:", formatMemoryUsage(process.memoryUsage().heapUsed));

			const jsonString = `[${stdout.trim().split("\n").join(",")}]`;
			const containers: Container[] = JSON.parse(jsonString);

			// Log memoria después de parsear JSON
			console.log("Memory after JSON parse:", formatMemoryUsage(process.memoryUsage().heapUsed));

			if (containers.length === 0) {
				return;
			}

			const seenServices = new Set<string>();
			const filteredContainer = containers.filter((container) => {
				if (!shouldMonitorContainer(container.Name)) return false;

				const serviceName = getServiceName(container.Name);
				if (seenServices.has(serviceName)) return false;

				seenServices.add(serviceName);
				return true;
			});

			console.log(`Writing metrics for ${filteredContainer.length} containers`);
			console.log("Memory before file operations:", formatMemoryUsage(process.memoryUsage().heapUsed));

			for (const container of filteredContainer) {
				try {
					const serviceName = getServiceName(container.Name);
					const containerPath = join(containerLogFile, `${serviceName}.log`);
					const processedData = processContainerData(container);
					const logLine = `${JSON.stringify(processedData)}\n`;
					const containerConfig = getContainerConfig(container.Name);

					const { maxFileSizeMB = 10 } = containerConfig;

					if (fs.existsSync(containerPath)) {
						const stats = await fs.promises.stat(containerPath);
						const fileSizeInMB = stats.size / (1024 * 1024);
						if (fileSizeInMB >= maxFileSizeMB) {
							console.log(`File size exceeded for ${serviceName}: ${fileSizeInMB}MB`);
							console.log("Memory before file read:", formatMemoryUsage(process.memoryUsage().heapUsed));
							
							const fileContent = fs.readFileSync(containerPath, "utf-8");
							const lines = fileContent
								.split("\n")
								.filter((line) => line.trim());

							console.log("Memory after file read:", formatMemoryUsage(process.memoryUsage().heapUsed));

							const linesToKeep = Math.floor(lines.length / 2);
							const newContent = `${lines.slice(-linesToKeep).join("\n")}\n`;
							fs.writeFileSync(containerPath, newContent);
							// await fs.promises.truncate(containerPath, 0);
							
							console.log("Memory after file write:", formatMemoryUsage(process.memoryUsage().heapUsed));
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

			// Log memoria final
			console.log("Final memory usage:", formatMemoryUsage(process.memoryUsage().heapUsed));
			global.gc?.(); // Forzar garbage collection si está disponible
		} catch (error) {
			console.error("Error getting container metrics:", error);
		}
	}, REFRESH_RATE_CONTAINER);

	process.on("SIGTERM", cleanup);
	process.on("SIGINT", cleanup);
};
