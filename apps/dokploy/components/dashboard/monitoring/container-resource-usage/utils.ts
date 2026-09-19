export interface ContainerResourceStat {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
	Size?: string;
}

export type ContainerResourceSort =
	| "cpu"
	| "memory"
	| "size"
	| "block"
	| "network";

export interface ContainerResourceValues {
	blockReadBytes: number;
	blockTotalBytes: number;
	blockWriteBytes: number;
	cpuPercent: number;
	diskSizeBytes: number;
	memoryLimitBytes: number;
	memoryPercent: number;
	memoryUsedBytes: number;
	networkInputBytes: number;
	networkOutputBytes: number;
	networkTotalBytes: number;
	virtualSizeBytes: number;
}

const SIZE_UNITS: Record<string, number> = {
	b: 1,
	kb: 1000,
	mb: 1000 ** 2,
	gb: 1000 ** 3,
	tb: 1000 ** 4,
	kib: 1024,
	mib: 1024 ** 2,
	gib: 1024 ** 3,
	tib: 1024 ** 4,
};

export const parseDockerPercent = (raw: string): number => {
	const value = Number.parseFloat(raw.replace("%", ""));
	return Number.isFinite(value) ? value : 0;
};

export const parseDockerSize = (raw: string): number => {
	const match = raw.trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/);
	if (!match?.[1] || !match[2]) {
		return 0;
	}

	const value = Number.parseFloat(match[1]);
	const multiplier = SIZE_UNITS[match[2].toLowerCase()];
	if (!Number.isFinite(value) || !multiplier) {
		return 0;
	}

	return value * multiplier;
};

export const parseDockerPair = (
	raw: string,
): { leftBytes: number; rightBytes: number; totalBytes: number } => {
	const [left = "", right = ""] = raw.split("/").map((part) => part.trim());
	const leftBytes = parseDockerSize(left);
	const rightBytes = parseDockerSize(right);

	return {
		leftBytes,
		rightBytes,
		totalBytes: leftBytes + rightBytes,
	};
};

export const parseDockerContainerSize = (
	raw: string | undefined,
): { diskSizeBytes: number; virtualSizeBytes: number } => {
	if (!raw) {
		return {
			diskSizeBytes: 0,
			virtualSizeBytes: 0,
		};
	}

	const [diskSize = ""] = raw.split("(");
	const virtualMatch = raw.match(/\(virtual\s+([^)]+)\)/i);

	return {
		diskSizeBytes: parseDockerSize(diskSize.trim()),
		virtualSizeBytes: parseDockerSize(virtualMatch?.[1]?.trim() ?? ""),
	};
};

export const getContainerResourceValues = (
	stat: ContainerResourceStat,
): ContainerResourceValues => {
	const memory = parseDockerPair(stat.MemUsage);
	const block = parseDockerPair(stat.BlockIO);
	const network = parseDockerPair(stat.NetIO);
	const size = parseDockerContainerSize(stat.Size);

	return {
		blockReadBytes: block.leftBytes,
		blockTotalBytes: block.totalBytes,
		blockWriteBytes: block.rightBytes,
		cpuPercent: parseDockerPercent(stat.CPUPerc),
		diskSizeBytes: size.diskSizeBytes,
		memoryLimitBytes: memory.rightBytes,
		memoryPercent: parseDockerPercent(stat.MemPerc),
		memoryUsedBytes: memory.leftBytes,
		networkInputBytes: network.leftBytes,
		networkOutputBytes: network.rightBytes,
		networkTotalBytes: network.totalBytes,
		virtualSizeBytes: size.virtualSizeBytes,
	};
};

export const sortContainerStats = (
	stats: ContainerResourceStat[],
	sortBy: ContainerResourceSort,
) => {
	return [...stats].sort((a, b) => {
		const aValues = getContainerResourceValues(a);
		const bValues = getContainerResourceValues(b);

		const sortValues: Record<ContainerResourceSort, [number, number]> = {
			block: [aValues.blockTotalBytes, bValues.blockTotalBytes],
			cpu: [aValues.cpuPercent, bValues.cpuPercent],
			memory: [aValues.memoryUsedBytes, bValues.memoryUsedBytes],
			network: [aValues.networkTotalBytes, bValues.networkTotalBytes],
			size: [aValues.diskSizeBytes, bValues.diskSizeBytes],
		};
		const [aValue, bValue] = sortValues[sortBy];

		return bValue - aValue;
	});
};

export const formatDockerStatSize = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${bytes.toFixed(0)} B`;
};
