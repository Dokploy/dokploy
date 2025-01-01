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
	// const memUsedGB = (mem.total - mem.free - mem.buffcache) / 1024 / 1024 / 1024;
	// const memUsedGB = (mem.total - mem.free) / 1024 / 1024 / 1024;

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

export const logServerMetrics = () => {
	setInterval(async () => {
		const metrics = await getServerMetrics();

		const logLine = `${JSON.stringify(metrics)}\n`;

		// Verificar si el archivo existe y su tamaño
		if (fs.existsSync(serverLogFile)) {
			const stats = fs.statSync(serverLogFile);
			const fileSizeInMB = stats.size / (1024 * 1024);
			// console.log(
			// 	"File size:",
			// 	fileSizeInMB.toFixed(2),
			// 	"MB (max:",
			// 	MAX_FILE_SIZE_MB,
			// 	"MB)",
			// );

			if (fileSizeInMB >= MAX_FILE_SIZE_MB) {
				const fileContent = fs.readFileSync(serverLogFile, "utf-8");
				const lines = fileContent.split("\n").filter((line) => line.trim());

				const linesToKeep = Math.floor(lines.length / 2);
				const newContent = `${lines.slice(-linesToKeep).join("\n")}\n`;
				fs.writeFileSync(serverLogFile, newContent);
			}
		}

		fs.appendFile(serverLogFile, logLine, (err) => {
			if (err) console.error("Error to write server metrics:", err);
		});
	}, REFRESH_RATE_SERVER);
};
