import { exec } from "node:child_process";
import fs from "node:fs";
import util from "node:util";
import { join } from "node:path";
import console from "node:console";
import { config as dotenvConfig } from "dotenv";
import { containerLogFile } from "../constants.js";

dotenvConfig();

export const execAsync = util.promisify(exec);

interface ServiceConfig {
	appName: string;
	maxFileSizeMB: number;
}

interface MonitoringConfig {
	includeServices: ServiceConfig[];
	excludeServices: string[];
}

// Configuración por defecto
const DEFAULT_CONFIG: MonitoringConfig = {
	includeServices: [
		{
			appName: "*",
			maxFileSizeMB: 10,
		},
	],
	excludeServices: [],
};

// Cargar la configuración desde la variable de entorno
const loadConfig = (): MonitoringConfig => {
	try {
		const configJson = process.env.CONTAINER_MONITORING_CONFIG;

		if (!configJson) {
			return DEFAULT_CONFIG;
		}

		const parsedConfig = JSON.parse(configJson);
		return parsedConfig;
	} catch (error) {
		console.error("Error loading config:", error);
		return DEFAULT_CONFIG;
	}
};

const config = loadConfig();
const REFRESH_RATE_CONTAINER = Number(
	process.env.CONTAINER_REFRESH_RATE || 10000,
);

interface Container {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
}

interface ProcessedContainer {
	timestamp: string;
	BlockIO: {
		read: number;
		write: number;
		readUnit: string;
		writeUnit: string;
	};
	CPU: number;
	Container: string;
	ID: string;
	Memory: {
		percentage: number;
		used: number;
		total: number;
		unit: string;
	};
	Name: string;
	Network: {
		input: number;
		output: number;
		inputUnit: string;
		outputUnit: string;
	};
}

const shouldMonitorContainer = (containerName: string): boolean => {
	const { includeServices, excludeServices } = config;
	const serviceName = getServiceName(containerName);

	// Si está específicamente incluido, siempre monitorear
	if (includeServices.some((service) => service.appName === serviceName)) {
		return true;
	}

	// Si hay wildcard en includeServices y no está específicamente excluido
	if (
		includeServices.some((service) => service.appName === "*") &&
		!excludeServices.includes(serviceName)
	) {
		return true;
	}

	// En cualquier otro caso, no monitorear
	return false;
};

const getContainerConfig = (containerName: string): ServiceConfig => {
	const serviceName = getServiceName(containerName);
	const { includeServices } = config;

	// Si tiene configuración específica, usarla
	const specificConfig = includeServices.find(
		(service) => service.appName === serviceName,
	);
	if (specificConfig) {
		return specificConfig;
	}

	// Si no, usar la configuración por defecto (wildcard)
	const wildcardConfig = includeServices.find(
		(service) => service.appName === "*",
	);
	return wildcardConfig || { appName: "*", maxFileSizeMB: 10 };
};

function getServiceName(containerName: string): string {
	const match = containerName.match(
		/^([\w-]+(?:_[\w-]+)*)(?:\.\d+\.[a-z0-9]+)?$/,
	);
	return match ? match[1] : containerName;
}

function processContainerData(container: Container): ProcessedContainer {
	// Process CPU
	const cpu = Number.parseFloat(container.CPUPerc.replace("%", ""));

	// Process Memory
	const memPerc = Number.parseFloat(container.MemPerc.replace("%", ""));
	const [used, total] = container.MemUsage.split(" / ");
	const usedValue = Number.parseFloat(used);
	const totalValue = Number.parseFloat(total);
	const memUnit = used.replace(/[\d.]/g, "");

	// Process Network I/O
	const [input, output] = container.NetIO.split(" / ");
	const networkInput = Number.parseFloat(input);
	const networkOutput = Number.parseFloat(output);
	const inputUnit = input.replace(/[\d.]/g, "");
	const outputUnit = output.replace(/[\d.]/g, "");

	// Process Block I/O
	const [read, write] = container.BlockIO.split(" / ");
	const blockRead = Number.parseFloat(read);
	const blockWrite = Number.parseFloat(write);
	const readUnit = read.replace(/[\d.]/g, "");
	const writeUnit = write.replace(/[\d.]/g, "");

	return {
		timestamp: new Date().toISOString(),
		CPU: cpu,
		Memory: {
			percentage: memPerc,
			used: usedValue,
			total: totalValue,
			unit: memUnit,
		},
		Network: {
			input: networkInput,
			output: networkOutput,
			inputUnit,
			outputUnit,
		},
		BlockIO: {
			read: blockRead,
			write: blockWrite,
			readUnit,
			writeUnit,
		},
		Container: container.Container,
		ID: container.ID,
		Name: container.Name,
	};
}

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
				const shouldMonitor = shouldMonitorContainer(container.Name);
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
					const config = getContainerConfig(container.Name);

					const { maxFileSizeMB = 10 } = config;

					const stats = await fs.promises.stat(containerPath);
					const fileSizeInMB = stats.size / (1024 * 1024);

					console.log(fileSizeInMB);
					if (fileSizeInMB >= maxFileSizeMB) {
						const fileContent = fs.readFileSync(containerPath, "utf-8");
						const lines = fileContent.split("\n").filter((line) => line.trim());

						const linesToKeep = Math.floor(lines.length / 2);
						const newContent = `${lines.slice(-linesToKeep).join("\n")}\n`;
						fs.writeFileSync(containerPath, newContent);
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
