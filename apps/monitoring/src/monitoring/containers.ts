import { exec } from "node:child_process";
import fs from "node:fs";
import util from "node:util";
export const execAsync = util.promisify(exec);
import { containerLogFile, serverLogFile } from "../constants.js";
import path, { join } from "node:path";

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
	PIDs: string;
}

function getServiceName(containerName: string): string {
	const match = containerName.match(
		/^([\w-]+(?:_[\w-]+)*)(?:\.\d+\.[a-z0-9]+)?$/,
	);
	return match ? match[1] : containerName;
}

// console.log(
// 	getServiceName("testing-testing-cg5shr.1.6oupbsgicchhrsgmb4mljxgvt"),
// ); // testing-testing-cg5shr
// console.log(getServiceName("dokploy-traefik.1.bxaajgx0fmv6l6y37tl5uyf64")); // dokploy-traefik
// console.log(getServiceName("plausible_events_db")); // plausible_events_db (sin cambios)

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
				"docker stats --no-stream --format '{{json .}}'",
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

					// Obtener o crear el handle del archivo
					let fileHandle = fileHandles.get(serviceName);
					if (!fileHandle) {
						fileHandle = await fs.promises.open(containerPath, "a");
						fileHandles.set(serviceName, fileHandle);
					}

					const logLine = `${JSON.stringify({
						timestamp: new Date().toISOString(),
						...container,
					})}\n`;

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
