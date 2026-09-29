import { execFile } from "node:child_process";
import { promises } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { OSUtils } from "node-os-utils";
import { paths } from "../constants";
import { execAsyncRemote } from "../utils/process/execAsync";
import { parseIoToMb } from "./units";

export { LOCAL_SERVER_ID, getMonitoringAppName } from "./constants";

const execFileAsync = promisify(execFile);

export interface Container {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
	SwapUsage?: string;
}

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

const formatSwapUsage = (usedBytes: number, totalBytes: number): string =>
	`${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`;

const parseMacOsSwapSize = (value: string, unit: string): number => {
	const parsedValue = Number.parseFloat(value);

	if (!Number.isFinite(parsedValue)) {
		return 0;
	}

	switch (unit.toUpperCase()) {
		case "G":
			return parsedValue * 1024 * 1024 * 1024;
		case "M":
			return parsedValue * 1024 * 1024;
		case "K":
			return parsedValue * 1024;
		default:
			return parsedValue;
	}
};

export const parseMacOsSwapUsage = (
	output: string,
): { totalBytes: number; usedBytes: number } | null => {
	const match = output.match(
		/total\s*=\s*([0-9.]+)([KMG]?)\s+used\s*=\s*([0-9.]+)([KMG]?)/i,
	);

	if (!match) {
		return null;
	}

	return {
		totalBytes: parseMacOsSwapSize(match[1] ?? "0", match[2] ?? ""),
		usedBytes: parseMacOsSwapSize(match[3] ?? "0", match[4] ?? ""),
	};
};

const getMacOsSwapUsage = async (): Promise<string | undefined> => {
	try {
		const { stdout } = await execFileAsync("sysctl", ["-n", "vm.swapusage"]);
		const parsedSwap = parseMacOsSwapUsage(stdout);

		if (!parsedSwap) {
			return undefined;
		}

		return formatSwapUsage(parsedSwap.usedBytes, parsedSwap.totalBytes);
	} catch {
		return undefined;
	}
};

const getSwapUsage = async (osutils: OSUtils): Promise<string | undefined> => {
	const swapResult = await osutils.memory.swap();

	if (swapResult.success && swapResult.data.total.toBytes() > 0) {
		return formatSwapUsage(
			swapResult.data.used.toBytes(),
			swapResult.data.total.toBytes(),
		);
	}

	if (os.platform() === "darwin") {
		return getMacOsSwapUsage();
	}

	if (swapResult.success) {
		return formatSwapUsage(
			swapResult.data.used.toBytes(),
			swapResult.data.total.toBytes(),
		);
	}

	return undefined;
};

export const recordAdvancedStats = async (
	stats: Container,
	appName: string,
) => {
	const { MONITORING_PATH } = paths();
	const path = `${MONITORING_PATH}/${appName}`;

	await promises.mkdir(path, { recursive: true });

	const memoryStats: {
		used: string | undefined;
		total: string | undefined;
		swap?: {
			used: string;
			total: string;
		};
	} = {
		used: stats.MemUsage.split(" ")[0],
		total: stats.MemUsage.split(" ")[2],
	};
	const swapUsed = stats.SwapUsage?.split(" ")[0];
	const swapTotal = stats.SwapUsage?.split(" ")[2];

	if (swapUsed && swapTotal) {
		memoryStats.swap = {
			used: swapUsed,
			total: swapTotal,
		};
	}

	await updateStatsFile(appName, "cpu", stats.CPUPerc);
	await updateStatsFile(appName, "memory", memoryStats);

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

// Filter out virtual devices (loop, ram, sr, etc.) - only include real disk devices
const NON_PHYSICAL_DEVICE_PATTERNS = [
	/^(loop|ram|zram)/,
	/^(sr|fd)\d+$/,
	// Partitions and md/dm devices repeat I/O already counted on the underlying disk.
	/^(sd|hd|vd|xvd)[a-z]+\d+$/,
	/^(nvme\d+n\d+|mmcblk\d+)p\d+$/,
	/^(md|dm-)/,
];

export const isPhysicalDisk = (device: string) =>
	!NON_PHYSICAL_DEVICE_PATTERNS.some((pattern) => pattern.test(device));

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

	const swapUsageFormatted = await getSwapUsage(osutils);

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
		for (const stat of diskStats.data) {
			// Skip virtual, partition and stacked devices
			if (stat.device && !isPhysicalDisk(stat.device)) {
				continue;
			}
			// readBytes and writeBytes are DataSize objects with .toBytes() method
			blockReadBytes += stat.readBytes.toBytes();
			blockWriteBytes += stat.writeBytes.toBytes();
		}
	}

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
		SwapUsage: swapUsageFormatted,
		BlockIO: blockIOFormatted,
		NetIO: netIOFormatted,
		Container: "dokploy",
		ID: "host-system",
		Name: "dokploy",
	};
};

// LC_ALL=C forces a POSIX locale so numeric output uses `.` as the decimal
// separator. Without it, locales like de_DE.UTF-8 emit `0,5` which breaks
// every `awk` arithmetic and our downstream `Number.parseFloat`.
//
// CPU: `top -bn1` reports the CPU snapshot accumulated since boot (effectively
// stale/~0 for steady-state systems). We use `top -bn2 -d 0.5` and parse the
// SECOND `%Cpu` line, which is the delta over the 0.5s interval.
//
// Network interface filter is a deny-list (lo, docker*, veth*, br-*) so we
// pick up real NICs of any name (eth*, ens*, enp*, wlan*, bond*, wg*,
// tailscale*, etc.) without enumerating them.
const REMOTE_STATS_SCRIPT = `
export LC_ALL=C
CPU=$(top -bn2 -d 0.5 2>/dev/null | grep 'Cpu(s)' | tail -1 | awk '{print $2+$4}' 2>/dev/null || echo 0)
MEM_TOTAL=$(free -b 2>/dev/null | awk '/^Mem:/ {print $2}' 2>/dev/null || echo 0)
MEM_USED=$(free -b 2>/dev/null | awk '/^Mem:/ {print $3}' 2>/dev/null || echo 0)
DISK_TOTAL=$(df -B1 / 2>/dev/null | awk 'NR==2 {print $2}' 2>/dev/null || echo 0)
DISK_USED=$(df -B1 / 2>/dev/null | awk 'NR==2 {print $3}' 2>/dev/null || echo 0)
NET_RX=$(cat /proc/net/dev 2>/dev/null | awk 'NR>2 {iface=$1; sub(/:$/,"",iface); if (iface !~ /^(lo|docker|veth|br-)/) rx+=$2} END {print rx+0}')
NET_TX=$(cat /proc/net/dev 2>/dev/null | awk 'NR>2 {iface=$1; sub(/:$/,"",iface); if (iface !~ /^(lo|docker|veth|br-)/) tx+=$10} END {print tx+0}')
BLOCK_READ=$(cat /proc/diskstats 2>/dev/null | awk '$3 ~ /^(sd|nvme|vd)/ {r+=$6} END {print (r+0)*512}')
BLOCK_WRITE=$(cat /proc/diskstats 2>/dev/null | awk '$3 ~ /^(sd|nvme|vd)/ {w+=$10} END {print (w+0)*512}')
echo "{\\"cpu\\":\\"$CPU\\",\\"memTotal\\":\\"$MEM_TOTAL\\",\\"memUsed\\":\\"$MEM_USED\\",\\"diskTotal\\":\\"$DISK_TOTAL\\",\\"diskUsed\\":\\"$DISK_USED\\",\\"netRx\\":\\"$NET_RX\\",\\"netTx\\":\\"$NET_TX\\",\\"blockRead\\":\\"$BLOCK_READ\\",\\"blockWrite\\":\\"$BLOCK_WRITE\\"}"
`;

interface RawRemoteStats {
	cpu: number;
	memTotal: number;
	memUsed: number;
	diskTotal: number;
	diskUsed: number;
	netRx: number;
	netTx: number;
	blockRead: number;
	blockWrite: number;
}

const parseNum = (val: unknown): number => {
	if (typeof val !== "string" && typeof val !== "number") return 0;
	const n = Number.parseFloat(String(val).trim());
	return Number.isFinite(n) ? n : 0;
};

const formatBytesPair = (a: number, b: number): string => {
	const fmt = (n: number): string => {
		if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)}GiB`;
		if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)}MiB`;
		if (n >= 1024) return `${(n / 1024).toFixed(2)}KiB`;
		return `${n}B`;
	};
	return `${fmt(a)} / ${fmt(b)}`;
};

const parseRemoteStats = (stdout: string): RawRemoteStats => {
	try {
		const json = JSON.parse(stdout.trim()) as Record<string, unknown>;
		return {
			cpu: parseNum(json.cpu),
			memTotal: parseNum(json.memTotal),
			memUsed: parseNum(json.memUsed),
			diskTotal: parseNum(json.diskTotal),
			diskUsed: parseNum(json.diskUsed),
			netRx: parseNum(json.netRx),
			netTx: parseNum(json.netTx),
			blockRead: parseNum(json.blockRead),
			blockWrite: parseNum(json.blockWrite),
		};
	} catch {
		return {
			cpu: 0,
			memTotal: 0,
			memUsed: 0,
			diskTotal: 0,
			diskUsed: 0,
			netRx: 0,
			netTx: 0,
			blockRead: 0,
			blockWrite: 0,
		};
	}
};

/**
 * Fetch host system stats from a remote server over SSH and return them
 * in the same shape as `getHostSystemStats` so downstream `recordAdvancedStats`
 * works unchanged.
 *
 * Disk stats are intentionally returned alongside (via the `disk` property)
 * because `recordAdvancedStats` only writes disk for the local "dokploy" appName.
 * Callers should pass the disk numbers to `recordRemoteDiskStats` themselves.
 */
export const getRemoteSystemStats = async (
	serverId: string,
): Promise<{
	container: Container;
	disk: { diskTotal: number; diskUsed: number };
}> => {
	const { stdout } = await execAsyncRemote(serverId, REMOTE_STATS_SCRIPT);
	const raw = parseRemoteStats(stdout);

	const memUsedGiB = raw.memUsed / 1024 ** 3;
	const memTotalGiB = raw.memTotal / 1024 ** 3;
	const memUsedPercent =
		raw.memTotal > 0 ? (raw.memUsed / raw.memTotal) * 100 : 0;

	const container: Container = {
		CPUPerc: `${raw.cpu.toFixed(2)}%`,
		MemPerc: `${memUsedPercent.toFixed(2)}%`,
		MemUsage: `${memUsedGiB.toFixed(2)}GiB / ${memTotalGiB.toFixed(2)}GiB`,
		BlockIO: formatBytesPair(raw.blockRead, raw.blockWrite),
		NetIO: `${(raw.netRx / 1024 ** 2).toFixed(2)}MB / ${(raw.netTx / 1024 ** 2).toFixed(2)}MB`,
		Container: serverId,
		ID: "remote-host",
		Name: serverId,
	};

	return {
		container,
		disk: { diskTotal: raw.diskTotal, diskUsed: raw.diskUsed },
	};
};

/**
 * Write disk stats for a remote server. `recordAdvancedStats` only writes
 * the disk stat file when `appName === "dokploy"` (using local node-os-utils),
 * so for remote servers we write it explicitly here.
 */
export const recordRemoteDiskStats = async (
	appName: string,
	diskTotalBytes: number,
	diskUsedBytes: number,
): Promise<void> => {
	const { MONITORING_PATH } = paths();
	await promises.mkdir(`${MONITORING_PATH}/${appName}`, { recursive: true });

	const diskTotal = +(diskTotalBytes / 1024 ** 3).toFixed(2);
	const diskUsage = +(diskUsedBytes / 1024 ** 3).toFixed(2);
	const diskFree = +((diskTotalBytes - diskUsedBytes) / 1024 ** 3).toFixed(2);
	const diskUsedPercentage =
		diskTotalBytes > 0
			? +((diskUsedBytes / diskTotalBytes) * 100).toFixed(2)
			: 0;

	await updateStatsFile(appName, "disk", {
		diskTotal,
		diskUsage,
		diskFree,
		diskUsedPercentage,
	});
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
