import { getAllContainerStats } from "../services/docker";
import { findProjectById } from "../services/project";
import type { Container } from "./utils";

export type ProjectServiceType =
	| "application"
	| "compose"
	| "mariadb"
	| "postgres"
	| "mysql"
	| "mongo"
	| "redis"
	| "libsql";

export interface ProjectServiceRef {
	id: string;
	name: string;
	appName: string;
	type: ProjectServiceType;
}

export interface ProjectServiceStats extends ProjectServiceRef {
	cpuPerc: number;
	memUsed: string;
	memLimit: string;
	memUsedBytes: number;
	memLimitBytes: number;
	containerCount: number;
	blockReadMb: number;
	blockWriteMb: number;
	netInputMb: number;
	netOutputMb: number;
}

export interface ProjectResourceStats {
	projectId: string;
	projectName: string;
	aggregated: {
		cpu: { value: string; time: string };
		memory: {
			value: { used: string; total: string };
			time: string;
		};
		block: {
			value: { readMb: number; writeMb: number };
			time: string;
		};
		network: {
			value: { inputMb: number; outputMb: number };
			time: string;
		};
	};
	services: ProjectServiceStats[];
}

const UNIT_TO_BYTES: Record<string, number> = {
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

export const parseDockerSizeToBytes = (value: string | undefined): number => {
	if (!value || typeof value !== "string") return 0;
	const trimmed = value.trim();
	if (!trimmed || trimmed === "--") return 0;

	const match = trimmed.match(/^([\d.]+)\s*([a-zA-Z]+)$/);
	if (!match) {
		const asNumber = Number.parseFloat(trimmed);
		return Number.isFinite(asNumber) ? asNumber : 0;
	}

	const amount = Number.parseFloat(match[1] || "0");
	const unit = (match[2] || "").toLowerCase();
	const multiplier = UNIT_TO_BYTES[unit] ?? 1;
	return Number.isFinite(amount) ? amount * multiplier : 0;
};

export const formatBytesAsDockerSize = (bytes: number): string => {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)}GiB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)}MiB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)}KiB`;
	return `${Math.round(bytes)}B`;
};

const parseCpuPercent = (value: string | undefined): number => {
	if (!value) return 0;
	const parsed = Number.parseFloat(String(value).replace("%", ""));
	return Number.isFinite(parsed) ? parsed : 0;
};

const parseIoPairToMb = (
	value: string | undefined,
): { left: number; right: number } => {
	if (!value) return { left: 0, right: 0 };
	const [leftRaw, rightRaw] = value.split("/").map((part) => part.trim());
	return {
		left: parseDockerSizeToBytes(leftRaw) / (1000 * 1000),
		right: parseDockerSizeToBytes(rightRaw) / (1000 * 1000),
	};
};

const parseMemUsage = (
	value: string | undefined,
): { usedBytes: number; limitBytes: number } => {
	if (!value) return { usedBytes: 0, limitBytes: 0 };
	const [usedRaw, limitRaw] = value.split("/").map((part) => part.trim());
	return {
		usedBytes: parseDockerSizeToBytes(usedRaw),
		limitBytes: parseDockerSizeToBytes(limitRaw),
	};
};

export const collectProjectServices = (
	project: Awaited<ReturnType<typeof findProjectById>>,
	accessedServices?: string[],
): ProjectServiceRef[] => {
	const allow = (id: string) =>
		!accessedServices || accessedServices.includes(id);

	const services: ProjectServiceRef[] = [];

	for (const environment of project.environments) {
		for (const item of environment.applications) {
			if (!allow(item.applicationId)) continue;
			services.push({
				id: item.applicationId,
				name: item.name,
				appName: item.appName,
				type: "application",
			});
		}
		for (const item of environment.compose) {
			if (!allow(item.composeId)) continue;
			services.push({
				id: item.composeId,
				name: item.name,
				appName: item.appName,
				type: "compose",
			});
		}
		for (const item of environment.mariadb) {
			if (!allow(item.mariadbId)) continue;
			services.push({
				id: item.mariadbId,
				name: item.name,
				appName: item.appName,
				type: "mariadb",
			});
		}
		for (const item of environment.postgres) {
			if (!allow(item.postgresId)) continue;
			services.push({
				id: item.postgresId,
				name: item.name,
				appName: item.appName,
				type: "postgres",
			});
		}
		for (const item of environment.mysql) {
			if (!allow(item.mysqlId)) continue;
			services.push({
				id: item.mysqlId,
				name: item.name,
				appName: item.appName,
				type: "mysql",
			});
		}
		for (const item of environment.mongo) {
			if (!allow(item.mongoId)) continue;
			services.push({
				id: item.mongoId,
				name: item.name,
				appName: item.appName,
				type: "mongo",
			});
		}
		for (const item of environment.redis) {
			if (!allow(item.redisId)) continue;
			services.push({
				id: item.redisId,
				name: item.name,
				appName: item.appName,
				type: "redis",
			});
		}
		for (const item of environment.libsql) {
			if (!allow(item.libsqlId)) continue;
			services.push({
				id: item.libsqlId,
				name: item.name,
				appName: item.appName,
				type: "libsql",
			});
		}
	}

	return services;
};

const containerMatchesService = (
	containerName: string,
	service: ProjectServiceRef,
): boolean => {
	const name = containerName.toLowerCase();
	const appName = service.appName.toLowerCase();
	if (!appName) return false;

	// Swarm service / task names and compose project prefixes include appName
	return (
		name === appName ||
		name.startsWith(`${appName}.`) ||
		name.startsWith(`${appName}_`) ||
		name.startsWith(`${appName}-`) ||
		name.includes(`/${appName}`) ||
		name.includes(`_${appName}_`) ||
		name.includes(`.${appName}.`)
	);
};

export const aggregateProjectContainerStats = (
	services: ProjectServiceRef[],
	containers: Container[],
	now = new Date().toISOString(),
): Pick<ProjectResourceStats, "aggregated" | "services"> => {
	const serviceStats: ProjectServiceStats[] = services.map((service) => ({
		...service,
		cpuPerc: 0,
		memUsed: "0B",
		memLimit: "0B",
		memUsedBytes: 0,
		memLimitBytes: 0,
		containerCount: 0,
		blockReadMb: 0,
		blockWriteMb: 0,
		netInputMb: 0,
		netOutputMb: 0,
	}));

	let totalCpu = 0;
	let totalMemUsed = 0;
	let maxMemLimit = 0;
	let totalBlockRead = 0;
	let totalBlockWrite = 0;
	let totalNetIn = 0;
	let totalNetOut = 0;

	for (const container of containers) {
		const matched = serviceStats.find((service) =>
			containerMatchesService(container.Name || "", service),
		);
		if (!matched) continue;

		const cpu = parseCpuPercent(container.CPUPerc);
		const memory = parseMemUsage(container.MemUsage);
		const block = parseIoPairToMb(container.BlockIO);
		const network = parseIoPairToMb(container.NetIO);

		matched.cpuPerc += cpu;
		matched.memUsedBytes += memory.usedBytes;
		matched.memLimitBytes = Math.max(matched.memLimitBytes, memory.limitBytes);
		matched.containerCount += 1;
		matched.blockReadMb += block.left;
		matched.blockWriteMb += block.right;
		matched.netInputMb += network.left;
		matched.netOutputMb += network.right;

		totalCpu += cpu;
		totalMemUsed += memory.usedBytes;
		maxMemLimit = Math.max(maxMemLimit, memory.limitBytes);
		totalBlockRead += block.left;
		totalBlockWrite += block.right;
		totalNetIn += network.left;
		totalNetOut += network.right;
	}

	for (const service of serviceStats) {
		service.memUsed = formatBytesAsDockerSize(service.memUsedBytes);
		service.memLimit = formatBytesAsDockerSize(service.memLimitBytes);
		service.cpuPerc = Number(service.cpuPerc.toFixed(2));
		service.blockReadMb = Number(service.blockReadMb.toFixed(2));
		service.blockWriteMb = Number(service.blockWriteMb.toFixed(2));
		service.netInputMb = Number(service.netInputMb.toFixed(2));
		service.netOutputMb = Number(service.netOutputMb.toFixed(2));
	}

	serviceStats.sort(
		(a, b) => b.cpuPerc - a.cpuPerc || b.memUsedBytes - a.memUsedBytes,
	);

	return {
		aggregated: {
			cpu: {
				value: `${totalCpu.toFixed(2)}%`,
				time: now,
			},
			memory: {
				value: {
					used: formatBytesAsDockerSize(totalMemUsed),
					total: formatBytesAsDockerSize(maxMemLimit),
				},
				time: now,
			},
			block: {
				value: {
					readMb: Number(totalBlockRead.toFixed(2)),
					writeMb: Number(totalBlockWrite.toFixed(2)),
				},
				time: now,
			},
			network: {
				value: {
					inputMb: Number(totalNetIn.toFixed(2)),
					outputMb: Number(totalNetOut.toFixed(2)),
				},
				time: now,
			},
		},
		services: serviceStats,
	};
};

export const getProjectResourceStats = async (
	projectId: string,
	options?: { accessedServices?: string[] },
): Promise<ProjectResourceStats> => {
	const project = await findProjectById(projectId);
	const services = collectProjectServices(project, options?.accessedServices);
	const containers = (await getAllContainerStats()) as Container[];
	const { aggregated, services: serviceStats } = aggregateProjectContainerStats(
		services,
		containers,
	);

	return {
		projectId: project.projectId,
		projectName: project.name,
		aggregated,
		services: serviceStats,
	};
};
