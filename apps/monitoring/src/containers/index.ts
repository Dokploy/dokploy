import { exec } from "node:child_process";
import fs from "node:fs";
import util from "node:util";
import { join } from "node:path";
import console from "node:console";
import schedule from "node-schedule";
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

// Mantener un handle de los archivos abiertos
const fileHandles = new Map<string, fs.promises.FileHandle>();

async function getFileHandle(path: string): Promise<fs.promises.FileHandle> {
	if (!fileHandles.has(path)) {
		const handle = await fs.promises.open(path, "a");
		fileHandles.set(path, handle);
	}
	return fileHandles.get(path)!;
}

export const logContainerMetrics = () => {
	console.log("Refresh rate:", REFRESH_RATE_CONTAINER);

	let isRunning = false;
	let job: schedule.Job;

	const cleanup = async () => {
		if (job) {
			job.cancel();
		}

		for (const [path, handle] of fileHandles.entries()) {
			try {
				await handle.close();
				console.log(`Closed file handle for ${path}`);
			} catch (error) {
				console.error(`Error closing file handle for ${path}:`, error);
			}
		}
		fileHandles.clear();
	};

	const runMetricsCollection = async () => {
		if (isRunning) {
			console.log("Previous collection still running, skipping...");
			return;
		}

		isRunning = true;
		try {
			const { stdout, stderr } = (await Promise.race([
				execAsync(
					'docker stats --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'',
				),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Docker stats timeout")), 5000),
				),
			])) as { stdout: string; stderr: string };

			if (stderr) {
				console.error("Docker stats error:", stderr);
				return;
			}

			const containers: Container[] = JSON.parse(
				`[${stdout.trim().split("\n").join(",")}]`,
			);

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

			console.log(`Processing ${filteredContainer.length} containers`);

			for (const container of filteredContainer) {
				try {
					const serviceName = getServiceName(container.Name);
					const containerPath = join(containerLogFile, `${serviceName}.log`);
					const processedData = processContainerData(container);
					const logLine = `${JSON.stringify(processedData)}\n`;

					const handle = await getFileHandle(containerPath);
					const stats = await fs.promises.stat(containerPath);
					const fileSizeInMB = stats.size / (1024 * 1024);
					const containerConfig = getContainerConfig(container.Name);
					const { maxFileSizeMB = 10 } = containerConfig;

					if (fileSizeInMB >= maxFileSizeMB) {
						console.log(
							`File size exceeded for ${serviceName}: ${fileSizeInMB}MB`,
						);
						await handle.truncate(0);
					}

					await handle.write(logLine);
					await handle.sync();
				} catch (error) {
					console.error(
						`Error writing metrics for container ${container.Name}:`,
						error,
					);
				}
			}
		} catch (error) {
			console.error("Error getting container metrics:", error);
		} finally {
			isRunning = false;
		}
	};

	// Programar la tarea para que se ejecute cada X milisegundos
	const rule = new schedule.RecurrenceRule();
	rule.second = new schedule.Range(
		0,
		59,
		Math.floor(REFRESH_RATE_CONTAINER / 1000),
	);

	console.log(rule);
	job = schedule.scheduleJob(rule, runMetricsCollection);

	process.on("SIGTERM", cleanup);
	process.on("SIGINT", cleanup);
	process.on("exit", cleanup);

	return cleanup;
};
