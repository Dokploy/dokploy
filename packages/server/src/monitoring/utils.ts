import { promises } from "node:fs";
import { OSUtils } from "node-os-utils";
import { paths } from "../constants";
import { parseIoToMb } from "./units";

export interface Container {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
}
export const recordAdvancedStats = async (
	stats: Container,
	appName: string,
) => {
	const { MONITORING_PATH } = paths();
	const path = `${MONITORING_PATH}/${appName}`;

	await promises.mkdir(path, { recursive: true });

	await updateStatsFile(appName, "cpu", stats.CPUPerc);
	await updateStatsFile(appName, "memory", {
		used: stats.MemUsage.split(" ")[0],
		total: stats.MemUsage.split(" ")[2],
	});

	await updateStatsFile(appName, "block", {
		readMb: parseIoToMb(stats.BlockIO.split(" ")[0]),
		writeMb: parseIoToMb(stats.BlockIO.split(" ")[2]),
	});

	await updateStatsFile(appName, "network", {
		inputMb: parseIoToMb(stats.NetIO.split(" ")[0]),
		outputMb: parseIoToMb(stats.NetIO.split(" ")[2]),
	});

	if (appName === "dokploy") {
		const osutils = new OSUtils();
		const diskResult = await osutils.disk.usageByMountPoint("/");

		if (diskResult.success && diskResult.data) {
			const disk = diskResult.data;
			const diskUsage = disk.used.toGB().toFixed(2);
			const diskTotal = disk.total.toGB().toFixed(2);
			const diskUsedPercentage = disk.usagePercentage;
			const diskFree = disk.available.toGB().toFixed(2);

			await updateStatsFile(appName, "disk", {
				diskTotal: +diskTotal,
				diskUsedPercentage: +diskUsedPercentage,
				diskUsage: +diskUsage,
				diskFree: +diskFree,
			});
		}
	}
};

// Virtual devices that never represent real disk I/O.
const virtualDiskPatterns = [/^loop/, /^ram/, /^sr\d+$/, /^fd\d+$/];

// Partition suffix patterns: sdX1, vdX1, xvdX1, hdX1 (trailing digits) and
// nvme0n1p1 / mmcblk0p1 / md0p1 (p<digits> after a digit-bearing base).
const partitionSuffixPatterns = [/p\d+$/, /\d+$/];

/**
 * Decides whether a /proc/diskstats row should be summed into host disk I/O.
 * Virtual devices (loop, ram, cdrom, floppy) are excluded, and a partition
 * row is excluded whenever its parent disk is also present, because the
 * parent disk's counters already include all of its partitions' I/O -
 * summing both counts every byte twice.
 */
export const shouldIncludeDiskStat = (
	device: string,
	allDevices: string[],
): boolean => {
	if (virtualDiskPatterns.some((pattern) => pattern.test(device))) {
		return false;
	}
	for (const suffixPattern of partitionSuffixPatterns) {
		if (!suffixPattern.test(device)) {
			continue;
		}
		const parent = device.replace(suffixPattern, "");
		if (parent !== device && allDevices.includes(parent)) {
			return false;
		}
	}
	return true;
};

/**
 * Get host system statistics using node-os-utils
 * This is used when monitoring "dokploy" to show host stats instead of container stats
 */
export const getHostSystemStats = async (): Promise<Container> => {
	const osutils = new OSUtils({
		disk: {
			includeStats: true, // Enable disk I/O statistics
		},
	});

	// Get CPU usage
	const cpuResult = await osutils.cpu.usage();
	const cpuUsage = cpuResult.success ? cpuResult.data : 0;

	// Get memory info
	const memResult = await osutils.memory.info();
	let memUsedGB = 0;
	let memTotalGB = 0;
	let memUsedPercent = 0;
	if (memResult.success) {
		memTotalGB = memResult.data.total.toGB();
		memUsedGB = memResult.data.used.toGB();
		memUsedPercent = memResult.data.usagePercentage;
	}

	// Get network stats from network.overview()
	let netInputBytes = 0;
	let netOutputBytes = 0;
	const networkOverview = await osutils.network.overview();
	if (networkOverview.success) {
		netInputBytes = networkOverview.data.totalRxBytes.toBytes();
		netOutputBytes = networkOverview.data.totalTxBytes.toBytes();
	}

	// Get Block I/O from disk.stats()
	let blockReadBytes = 0;
	let blockWriteBytes = 0;
	const diskStats = await osutils.disk.stats();
	if (diskStats.success && diskStats.data.length > 0) {
		const devices = diskStats.data
			.map((stat) => stat.device)
			.filter((device): device is string => !!device);
		for (const stat of diskStats.data) {
			// Skip virtual devices and partitions: /proc/diskstats lists a
			// partition's I/O in both its own row and its parent disk's row,
			// so summing both counts every byte twice.
			if (!stat.device || !shouldIncludeDiskStat(stat.device, devices)) {
				continue;
			}
			// readBytes and writeBytes are DataSize objects with .toBytes() method
			blockReadBytes += stat.readBytes.toBytes();
			blockWriteBytes += stat.writeBytes.toBytes();
		}
	}

	// Format values similar to docker stats
	const formatBytes = (bytes: number): string => {
		if (bytes >= 1024 * 1024 * 1024) {
			return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GiB`;
		}
		if (bytes >= 1024 * 1024) {
			return `${(bytes / (1024 * 1024)).toFixed(2)}MiB`;
		}
		if (bytes >= 1024) {
			return `${(bytes / 1024).toFixed(2)}KiB`;
		}
		return `${bytes}B`;
	};

	// Format memory usage similar to docker stats format: "used / total"
	const memUsedFormatted = `${memUsedGB.toFixed(2)}GiB`;
	const memTotalFormatted = `${memTotalGB.toFixed(2)}GiB`;
	const memUsageFormatted = `${memUsedFormatted} / ${memTotalFormatted}`;

	// Format network I/O
	const netInputMb = netInputBytes / (1024 * 1024);
	const netOutputMb = netOutputBytes / (1024 * 1024);
	const netIOFormatted = `${netInputMb.toFixed(2)}MB / ${netOutputMb.toFixed(2)}MB`;

	// Format Block I/O
	const blockIOFormatted = `${formatBytes(blockReadBytes)} / ${formatBytes(blockWriteBytes)}`;

	// Create a stat object compatible with recordAdvancedStats
	return {
		CPUPerc: `${cpuUsage.toFixed(2)}%`,
		MemPerc: `${memUsedPercent.toFixed(2)}%`,
		MemUsage: memUsageFormatted,
		BlockIO: blockIOFormatted,
		NetIO: netIOFormatted,
		Container: "dokploy",
		ID: "host-system",
		Name: "dokploy",
	};
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
	} catch {
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
	} catch {
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
