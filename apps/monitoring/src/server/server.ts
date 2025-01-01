import fs from "node:fs";
import si from "systeminformation";
import { serverLogFile } from "../constants.js";

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

const REFRESH_RATE_SERVER = Number(process.env.REFRESH_RATE_SERVER || 10000);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10); // 10 MB por defecto

const formatMemoryUsage = (data: number) =>
	`${Math.round((data / 1024 / 1024) * 100) / 100} MB`;
export function logMemoryUsage(label: string) {
	const memoryData = process.memoryUsage();
	console.log(`[Memory ${label}]`, {
		heapUsed: `${formatMemoryUsage(memoryData.heapUsed)} -> Actual Memory Used`,
		heapTotal: `${formatMemoryUsage(memoryData.heapTotal)} -> Total Size of the Heap`,
		rss: `${formatMemoryUsage(memoryData.rss)} -> Resident Set Size`,
		external: `${formatMemoryUsage(memoryData.external)} -> External Memory`,
	});
}

logMemoryUsage("Initial");

export const logServerMetrics = () => {
	logMemoryUsage("Before Server Metrics");

	const executeMetrics = async () => {
		logMemoryUsage("After Server Metrics");
		const metrics = await getServerMetrics();

		logMemoryUsage("Before Logging");

		const logLine = `${JSON.stringify(metrics)}\n`;

		logMemoryUsage("After Logging");

		if (fs.existsSync(serverLogFile)) {
			const stats = fs.statSync(serverLogFile);
			const fileSizeInMB = stats.size / (1024 * 1024);

			if (fileSizeInMB >= MAX_FILE_SIZE_MB) {
				const fileContent = fs.readFileSync(serverLogFile, "utf-8");
				const lines = fileContent.split("\n").filter((line) => line.trim());
				const linesToKeep = Math.floor(lines.length / 2);
				const newContent = `${lines.slice(-linesToKeep).join("\n")}\n`;
				fs.writeFileSync(serverLogFile, newContent);
			}
		}

		fs.appendFile(serverLogFile, logLine, (err) => {
			if (err) console.error("Error writing server metrics:", err);
		});
		logMemoryUsage("After Writing");

		// Llama recursivamente después del tiempo establecido
		setTimeout(executeMetrics, REFRESH_RATE_SERVER);
	};

	executeMetrics();
};
