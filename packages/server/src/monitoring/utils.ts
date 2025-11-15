import { promises } from "node:fs";
import { OSUtils } from "node-os-utils";
import { paths } from "../constants";
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
		readMb: stats.BlockIO.split(" ")[0],
		writeMb: stats.BlockIO.split(" ")[2],
	});

	await updateStatsFile(appName, "network", {
		inputMb: stats.NetIO.split(" ")[0],
		outputMb: stats.NetIO.split(" ")[2],
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
