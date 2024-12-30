import { exec } from "node:child_process";
import fs from "node:fs";
import util from "node:util";
export const execAsync = util.promisify(exec);
import { containerLogFile } from "../constants.js";
import { join } from "node:path";

const REFRESH_RATE_CONTAINER = Number(
	process.env.REFRESH_RATE_CONTAINER || 4000,
);

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);

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

	// Mantener un handle del archivo abierto para cada contenedor
	const fileHandles = new Map<string, fs.promises.FileHandle>();

	const cleanup = async () => {
		for (const [_, handle] of fileHandles) {
			await handle.close();
		}
		fileHandles.clear();
	};

	// Asegurar que cerramos los archivos al terminar
	process.on("SIGTERM", cleanup);
	process.on("SIGINT", cleanup);

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

			for (const container of containers) {
				try {
					const serviceName = getServiceName(container.Name);
					const containerPath = join(containerLogFile, `${serviceName}.log`);

					let fileHandle = fileHandles.get(serviceName);
					if (!fileHandle) {
						fileHandle = await fs.promises.open(containerPath, "a");
						fileHandles.set(serviceName, fileHandle);
					}

					const processedData = processContainerData(container);
					const logLine = `${JSON.stringify(processedData)}\n`;

					await fileHandle.write(logLine);
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
