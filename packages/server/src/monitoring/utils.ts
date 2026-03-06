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

type StatType = "cpu" | "memory" | "disk" | "network" | "block";

export interface MemoryStatValue {
	used: string;
	total: string;
}

export interface BlockStatValue {
	readMb: string;
	writeMb: string;
}

export interface NetworkStatValue {
	inputMb: string;
	outputMb: string;
}

export interface DiskStatValue {
	diskTotal: number;
	diskUsedPercentage: number;
	diskUsage: number;
	diskFree: number;
}

export type StatValue =
	| string
	| MemoryStatValue
	| BlockStatValue
	| NetworkStatValue
	| DiskStatValue;

export interface StatTypeMap {
	cpu: string;
	memory: MemoryStatValue;
	block: BlockStatValue;
	network: NetworkStatValue;
	disk: DiskStatValue;
}

const MAX_ENTRIES = 288;
const FLUSH_INTERVAL_MS = 30_000;

// Cached OSUtils instances
const osutils = new OSUtils();
const osutilsWithDisk = new OSUtils({ disk: { includeStats: true } });

// In-memory ring buffer
export interface StatsEntry<T = StatValue> {
	value: T;
	time: string;
}

class RingBuffer<T = StatValue> {
	private buffer: StatsEntry<T>[];
	private head = 0;
	private count = 0;

	constructor(private capacity: number) {
		this.buffer = new Array(capacity);
	}

	push(entry: StatsEntry<T>) {
		this.buffer[this.head] = entry;
		this.head = (this.head + 1) % this.capacity;
		if (this.count < this.capacity) {
			this.count++;
		}
	}

	toArray(): StatsEntry<T>[] {
		if (this.count === 0) return [];
		if (this.count < this.capacity) {
			return this.buffer.slice(0, this.count);
		}
		// Wrap around: from head to end, then start to head
		return [
			...this.buffer.slice(this.head),
			...this.buffer.slice(0, this.head),
		];
	}

	last(): StatsEntry<T> | null {
		if (this.count === 0) return null;
		const idx = (this.head - 1 + this.capacity) % this.capacity;
		return this.buffer[idx]!;
	}

	get length() {
		return this.count;
	}
}

const statsCache = new Map<string, RingBuffer>();
const dirtyKeys = new Set<string>();
let flushTimer: ReturnType<typeof setInterval> | null = null;

function getCacheKey(appName: string, statType: StatType): string {
	return `${appName}/${statType}`;
}

function getOrCreateBuffer(key: string): RingBuffer {
	let buf = statsCache.get(key);
	if (!buf) {
		buf = new RingBuffer(MAX_ENTRIES);
		statsCache.set(key, buf);
	}
	return buf;
}

async function loadFromDisk(
	appName: string,
	statType: StatType,
): Promise<RingBuffer> {
	const key = getCacheKey(appName, statType);
	const existing = statsCache.get(key);
	if (existing && existing.length > 0) return existing;

	const buf = getOrCreateBuffer(key);
	try {
		const { MONITORING_PATH } = paths();
		const filePath = `${MONITORING_PATH}/${appName}/${statType}.json`;
		const data = await promises.readFile(filePath, "utf-8");
		const entries: StatsEntry[] = JSON.parse(data);
		for (const entry of entries) {
			buf.push(entry);
		}
	} catch {
		// File doesn't exist yet
	}
	return buf;
}

async function flushToDisk() {
	if (dirtyKeys.size === 0) return;

	const { MONITORING_PATH } = paths();
	const keysToFlush = [...dirtyKeys];
	dirtyKeys.clear();

	for (const key of keysToFlush) {
		const buf = statsCache.get(key);
		if (!buf) continue;

		const [appName, statType] = key.split("/");
		const dirPath = `${MONITORING_PATH}/${appName}`;
		try {
			await promises.mkdir(dirPath, { recursive: true });
			await promises.writeFile(
				`${dirPath}/${statType}.json`,
				JSON.stringify(buf.toArray()),
			);
		} catch (err) {
			console.error(`Failed to flush stats for ${key}:`, err);
		}
	}
}

function ensureFlushTimer() {
	if (flushTimer) return;
	flushTimer = setInterval(flushToDisk, FLUSH_INTERVAL_MS);
	// Don't prevent process exit
	if (flushTimer.unref) flushTimer.unref();
}

// Flush on process exit
process.on("beforeExit", () => flushToDisk());
process.on("SIGTERM", () => {
	flushToDisk().then(() => process.exit(0));
});

export const recordAdvancedStats = async (
	stats: Container,
	appName: string,
) => {
	ensureFlushTimer();

	const memParts = stats.MemUsage.split(" ");
	const blockParts = stats.BlockIO.split(" ");
	const netParts = stats.NetIO.split(" ");

	await updateStatsFile(appName, "cpu", stats.CPUPerc);
	await updateStatsFile(appName, "memory", {
		used: memParts[0] ?? "0",
		total: memParts[2] ?? "0",
	});

	await updateStatsFile(appName, "block", {
		readMb: blockParts[0] ?? "0",
		writeMb: blockParts[2] ?? "0",
	});

	await updateStatsFile(appName, "network", {
		inputMb: netParts[0] ?? "0",
		outputMb: netParts[2] ?? "0",
	});

	if (appName === "dokploy") {
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

export const getHostSystemStats = async (): Promise<Container> => {
	// Get CPU usage
	const cpuResult = await osutilsWithDisk.cpu.usage();
	const cpuUsage = cpuResult.success ? cpuResult.data : 0;

	// Get memory info
	const memResult = await osutilsWithDisk.memory.info();
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
	const networkOverview = await osutilsWithDisk.network.overview();
	if (networkOverview.success) {
		netInputBytes = networkOverview.data.totalRxBytes.toBytes();
		netOutputBytes = networkOverview.data.totalTxBytes.toBytes();
	}

	// Get Block I/O from disk.stats()
	let blockReadBytes = 0;
	let blockWriteBytes = 0;
	const diskStats = await osutilsWithDisk.disk.stats();
	if (diskStats.success && diskStats.data.length > 0) {
		const excludePatterns = [/^loop/, /^ram/, /^sr\d+$/, /^fd\d+$/];
		for (const stat of diskStats.data) {
			if (
				stat.device &&
				excludePatterns.some((pattern) => pattern.test(stat.device))
			) {
				continue;
			}
			blockReadBytes += stat.readBytes.toBytes();
			blockWriteBytes += stat.writeBytes.toBytes();
		}
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

	const memUsedFormatted = `${memUsedGB.toFixed(2)}GiB`;
	const memTotalFormatted = `${memTotalGB.toFixed(2)}GiB`;
	const memUsageFormatted = `${memUsedFormatted} / ${memTotalFormatted}`;

	const netInputMb = netInputBytes / (1024 * 1024);
	const netOutputMb = netOutputBytes / (1024 * 1024);
	const netIOFormatted = `${netInputMb.toFixed(2)}MB / ${netOutputMb.toFixed(2)}MB`;

	const blockIOFormatted = `${formatBytes(blockReadBytes)} / ${formatBytes(blockWriteBytes)}`;

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

export const readStatsFile = async <T extends StatType>(
	appName: string,
	statType: T,
): Promise<StatsEntry<StatTypeMap[T]>[]> => {
	const key = getCacheKey(appName, statType);
	const cached = statsCache.get(key);
	if (cached && cached.length > 0) {
		return cached.toArray() as StatsEntry<StatTypeMap[T]>[];
	}

	// Cold start: load from disk
	const buf = await loadFromDisk(appName, statType);
	return buf.toArray() as StatsEntry<StatTypeMap[T]>[];
};

export const updateStatsFile = async (
	appName: string,
	statType: StatType,
	value: StatValue,
) => {
	const key = getCacheKey(appName, statType);
	const buf = getOrCreateBuffer(key);

	// Ensure buffer is loaded from disk on first write
	if (buf.length === 0) {
		await loadFromDisk(appName, statType);
	}

	const finalBuf = getOrCreateBuffer(key);
	finalBuf.push({ value, time: new Date().toISOString() });
	dirtyKeys.add(key);
};

export const readLastValueStatsFile = async <T extends StatType>(
	appName: string,
	statType: T,
): Promise<StatsEntry<StatTypeMap[T]> | null> => {
	const key = getCacheKey(appName, statType);
	const cached = statsCache.get(key);
	if (cached && cached.length > 0) {
		return cached.last() as StatsEntry<StatTypeMap[T]> | null;
	}

	// Cold start: load from disk
	const buf = await loadFromDisk(appName, statType);
	return buf.last() as StatsEntry<StatTypeMap[T]> | null;
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
