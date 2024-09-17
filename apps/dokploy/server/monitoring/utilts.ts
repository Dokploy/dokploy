import { promises } from "node:fs";
import type Dockerode from "dockerode";
import osUtils from "node-os-utils";
import { paths } from "../constants";

export const recordAdvancedStats = async (
	stats: Dockerode.ContainerStats,
	appName: string,
) => {
	const { MONITORING_PATH } = paths();
	const path = `${MONITORING_PATH}/${appName}`;

	await promises.mkdir(path, { recursive: true });

	const cpuPercent = calculateCpuUsagePercent(
		stats.cpu_stats,
		stats.precpu_stats,
	);
	const memoryStats = calculateMemoryStats(stats.memory_stats);
	const blockIO = calculateBlockIO(stats.blkio_stats);
	const networkUsage = calculateNetworkUsage(stats.networks);

	await updateStatsFile(appName, "cpu", cpuPercent);
	await updateStatsFile(appName, "memory", {
		used: memoryStats.used,
		free: memoryStats.free,
		usedPercentage: memoryStats.usedPercentage,
		total: memoryStats.total,
	});
	await updateStatsFile(appName, "block", {
		readMb: blockIO.readMb,
		writeMb: blockIO.writeMb,
	});

	await updateStatsFile(appName, "network", {
		inputMb: networkUsage.inputMb,
		outputMb: networkUsage.outputMb,
	});

	if (appName === "dokploy") {
		const disk = await osUtils.drive.info("/");

		const diskUsage = disk.usedGb;
		const diskTotal = disk.totalGb;
		const diskUsedPercentage = disk.usedPercentage;
		const diskFree = disk.freeGb;

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
		const { MONITORING_PATH } = paths();
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
	const { MONITORING_PATH } = paths();
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
		const { MONITORING_PATH } = paths();
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

const calculateCpuUsagePercent = (
	cpu_stats: Dockerode.ContainerStats["cpu_stats"],
	precpu_stats: Dockerode.ContainerStats["precpu_stats"],
) => {
	const cpuDelta =
		cpu_stats.cpu_usage.total_usage - precpu_stats.cpu_usage.total_usage;
	const systemDelta =
		cpu_stats.system_cpu_usage - precpu_stats.system_cpu_usage;

	const numberCpus =
		cpu_stats.online_cpus ||
		(cpu_stats.cpu_usage.percpu_usage
			? cpu_stats.cpu_usage.percpu_usage.length
			: 1);

	if (systemDelta > 0 && cpuDelta > 0) {
		return (cpuDelta / systemDelta) * numberCpus * 100.0;
	}
	return 0;
};

const calculateMemoryStats = (
	memory_stats: Dockerode.ContainerStats["memory_stats"],
) => {
	const usedMemory = memory_stats.usage - (memory_stats.stats.cache || 0);
	const availableMemory = memory_stats.limit;
	const memoryUsedPercentage = (usedMemory / availableMemory) * 100.0;

	return {
		used: usedMemory,
		free: availableMemory - usedMemory,
		usedPercentage: memoryUsedPercentage,
		total: availableMemory,
	};
};
const calculateBlockIO = (
	blkio_stats: Dockerode.ContainerStats["blkio_stats"],
) => {
	let readIO = 0;
	let writeIO = 0;
	if (blkio_stats?.io_service_bytes_recursive) {
		for (const io of blkio_stats.io_service_bytes_recursive) {
			if (io.op === "read") {
				readIO += io.value;
			} else if (io.op === "write") {
				writeIO += io.value;
			}
		}
	}
	return {
		readMb: readIO / (1024 * 1024),
		writeMb: writeIO / (1024 * 1024),
	};
};

const calculateNetworkUsage = (
	networks: Dockerode.ContainerStats["networks"],
) => {
	let totalRx = 0;
	let totalTx = 0;

	const stats = Object.keys(networks);

	for (const interfaceName of stats) {
		const net = networks[interfaceName];
		totalRx += net?.rx_bytes || 0;
		totalTx += net?.tx_bytes || 0;
	}
	return {
		inputMb: totalRx / (1024 * 1024),
		outputMb: totalTx / (1024 * 1024),
	};
};
