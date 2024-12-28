import fs from "node:fs";
import path from "node:path";
import Docker from "dockerode";
import si from "systeminformation";
import { config } from "dotenv";
import { containerLogFile, serverLogFile } from "./constants.js";
config();

const docker = new Docker();

const getServerMetrics = async () => {
	const [cpu, mem, load, fsSize, network, osInfo] = await Promise.all([
		si.cpu(),
		si.mem(),
		si.currentLoad(),
		si.fsSize(),
		si.networkStats(),
		si.osInfo(),
	]);

	// Calcular memoria usada en GB
	const memTotalGB = mem.total / 1024 / 1024 / 1024;
	const memUsedGB = (mem.total - mem.available) / 1024 / 1024 / 1024;
	const memUsedPercent = (memUsedGB / memTotalGB) * 100;

	return {
		// CPU info
		cpu: load.currentLoad.toFixed(2),
		cpuModel: `${cpu.manufacturer} ${cpu.brand}`,
		cpuCores: cpu.cores,
		cpuPhysicalCores: cpu.physicalCores,
		cpuSpeed: cpu.speed,
		// System info
		os: osInfo.platform,
		distro: osInfo.distro,
		kernel: osInfo.kernel,
		arch: osInfo.arch,
		// Memory
		memUsed: memUsedPercent.toFixed(2),
		memUsedGB: memUsedGB.toFixed(2),
		memTotal: memTotalGB.toFixed(2),
		// Other metrics
		uptime: si.time().uptime,
		diskUsed: fsSize[0].use.toFixed(2),
		totalDisk: (fsSize[0].size / 1024 / 1024 / 1024).toFixed(2),
		networkIn: (network[0].rx_bytes / 1024 / 1024).toFixed(2),
		networkOut: (network[0].tx_bytes / 1024 / 1024).toFixed(2),
		timestamp: new Date().toISOString(),
	};
};
// /Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker
export const logServerMetrics = () => {
	setInterval(async () => {
		const metrics = await getServerMetrics();

		console.log("Metrics:", metrics);

		const logLine = `${JSON.stringify(metrics)}\n`;

		fs.appendFile(serverLogFile, logLine, (err) => {
			if (err) console.error("Error al escribir en el archivo:", err);
		});
	}, 5000);
};

// === 2. Métricas de Contenedores ===
export const logContainerMetrics = () => {
	setInterval(async () => {
		try {
			const containers = await docker.listContainers({ all: true });
			const timestamp = new Date().toISOString();
			for (const container of containers) {
				const logLine = `${container.Names[0]} - Estado: ${container.State}\n`;
				fs.appendFile(containerLogFile, logLine, (err) => {
					if (err) console.error("Error al escribir log de contenedores:", err);
				});
			}
		} catch (error) {
			console.error("Error obteniendo contenedores:", error);
		}
	}, 10000);
};
