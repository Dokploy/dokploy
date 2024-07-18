import { promises } from "node:fs";
import dockerstats from "dockerstats";
import osUtils from "node-os-utils";
import { MONITORING_PATH } from "../constants";

export const recordAdvancedStats = async (
	appName: string,
	containerId: string,
) => {
	await promises.mkdir(`${MONITORING_PATH}/${appName}`, { recursive: true });

	const result = await dockerstats.dockerContainerStats(containerId);

	if (!result || result.length === 0 || !result[0]) return;

	const { memoryStats, cpuStats, precpuStats, netIO, blockIO } = result[0];

	const memoryUsage = memoryStats.usage / 1024 / 1024;
	const memoryTotal = memoryStats.limit / 1024 / 1024;
	const memoryFree = memoryTotal - memoryUsage;
	const memoryUsedPercentage = (memoryUsage / memoryTotal) * 100;

	const cpuDelta =
		cpuStats.cpu_usage.total_usage - precpuStats.cpu_usage.total_usage;
	const systemDelta = cpuStats.system_cpu_usage - precpuStats.system_cpu_usage;
	const onlineCpus = cpuStats.online_cpus;

	// Calcular el porcentaje de uso del CPU
	const cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;

	// Extraer los valores de entrada y salida del objeto netIO
	const networkInBytes = netIO.rx;
	const networkOutBytes = netIO.wx;

	// Convertir bytes a Megabytes
	const networkInMB = networkInBytes / 1024 / 1024;
	const networkOutMB = networkOutBytes / 1024 / 1024;

	// BlockIO

	const blockRead = blockIO.r;
	const blockWrite = blockIO.w;

	const blockInMBBlocks = blockRead / 1024 / 1024;
	const blockOutMBBlocks = blockWrite / 1024 / 1024;

	// Disk
	const disk = await osUtils.drive.info("/");

	const diskUsage = disk.usedGb;
	const diskTotal = disk.totalGb;
	const diskUsedPercentage = disk.usedPercentage;
	const diskFree = disk.freeGb;

	await updateStatsFile(appName, "cpu", cpuPercent);
	await updateStatsFile(appName, "memory", {
		used: memoryUsage,
		free: memoryFree,
		usedPercentage: memoryUsedPercentage,
		total: memoryTotal,
	});
	await updateStatsFile(appName, "block", {
		readMb: blockInMBBlocks,
		writeMb: blockOutMBBlocks,
	});
	await updateStatsFile(appName, "network", {
		inputMb: networkInMB,
		outputMb: networkOutMB,
	});

	if (appName === "dokploy") {
		await updateStatsFile(appName, "disk", {
			diskTotal: +diskTotal,
			diskUsedPercentage: +diskUsedPercentage,
			diskUsage: +diskUsage,
			diskFree: +diskFree,
		});
	}
};

export const getAdvancedStats = async (appName: string) => {
	return {
		cpu: await readStatsFile(appName, "cpu"),
		memory: await readStatsFile(appName, "memory"),
		disk: await readStatsFile(appName, "disk"),
		network: await readStatsFile(appName, "network"),
		block: await readStatsFile(appName, "block"),
	};
};

export const readStatsFile = async (
	appName: string,
	statType: "cpu" | "memory" | "disk" | "network" | "block",
) => {
	try {
		const filePath = `${MONITORING_PATH}/${appName}/${statType}.json`;
		const data = await promises.readFile(filePath, "utf-8");
		return JSON.parse(data);
	} catch (error) {
		return [];
	}
};

export const updateStatsFile = async (
	appName: string,
	statType: "cpu" | "memory" | "disk" | "network" | "block",
	value: number | string | unknown,
) => {
	const stats = await readStatsFile(appName, statType);
	stats.push({ value, time: new Date() });

	if (stats.length > 288) {
		stats.shift();
	}

	const content = JSON.stringify(stats);
	await promises.writeFile(
		`${MONITORING_PATH}/${appName}/${statType}.json`,
		content,
	);
};

export const readLastValueStatsFile = async (
	appName: string,
	statType: "cpu" | "memory" | "disk" | "network" | "block",
) => {
	try {
		const filePath = `${MONITORING_PATH}/${appName}/${statType}.json`;
		const data = await promises.readFile(filePath, "utf-8");
		const stats = JSON.parse(data);
		return stats[stats.length - 1] || null;
	} catch (error) {
		return null;
	}
};

export const getLastAdvancedStatsFile = async (appName: string) => {
	return {
		cpu: await readLastValueStatsFile(appName, "cpu"),
		memory: await readLastValueStatsFile(appName, "memory"),
		disk: await readLastValueStatsFile(appName, "disk"),
		network: await readLastValueStatsFile(appName, "network"),
		block: await readLastValueStatsFile(appName, "block"),
	};
};
