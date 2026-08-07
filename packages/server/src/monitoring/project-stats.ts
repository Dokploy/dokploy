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
	serverId: string | null;
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

type ContainerWithServer = Container & {
	serverId: string | null;
};

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

const pushService = (
	services: ProjectServiceRef[],
	service: ProjectServiceRef,
	allow: (id: string) => boolean,
) => {
	if (!allow(service.id)) return;
	services.push(service);
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
			pushService(
				services,
				{
					id: item.applicationId,
					name: item.name,
					appName: item.appName,
					type: "application",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.compose) {
			pushService(
				services,
				{
					id: item.composeId,
					name: item.name,
					appName: item.appName,
					type: "compose",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.mariadb) {
			pushService(
				services,
				{
					id: item.mariadbId,
					name: item.name,
					appName: item.appName,
					type: "mariadb",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.postgres) {
			pushService(
				services,
				{
					id: item.postgresId,
					name: item.name,
					appName: item.appName,
					type: "postgres",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.mysql) {
			pushService(
				services,
				{
					id: item.mysqlId,
					name: item.name,
					appName: item.appName,
					type: "mysql",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.mongo) {
			pushService(
				services,
				{
					id: item.mongoId,
					name: item.name,
					appName: item.appName,
					type: "mongo",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.redis) {
			pushService(
				services,
				{
					id: item.redisId,
					name: item.name,
					appName: item.appName,
					type: "redis",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
		for (const item of environment.libsql) {
			pushService(
				services,
				{
					id: item.libsqlId,
					name: item.name,
					appName: item.appName,
					type: "libsql",
					serverId: item.serverId ?? null,
				},
				allow,
			);
		}
	}

	return services;
};

/**
 * Score how specifically a container belongs to a service.
 * Longer appName matches win so `myapp-api` is not attributed to `myapp`.
 * Hyphen prefixes are intentionally excluded because Dokploy app names themselves
 * commonly contain hyphens (`myapp-api`), which would create false ownership.
 * Returns -1 when there is no valid ownership match.
 */
export const getContainerServiceMatchScore = (
	containerName: string,
	appName: string,
): number => {
	const name = containerName.toLowerCase();
	const normalizedAppName = appName.toLowerCase();
	if (!normalizedAppName || !name) return -1;

	if (name === normalizedAppName) {
		return normalizedAppName.length * 1000;
	}

	// Swarm task names: appName.1.hash
	if (name.startsWith(`${normalizedAppName}.`)) {
		return normalizedAppName.length;
	}

	// Compose project containers: appName_service_1
	if (name.startsWith(`${normalizedAppName}_`)) {
		return normalizedAppName.length;
	}

	return -1;
};

export const findBestMatchingService = <T extends ProjectServiceRef>(
	containerName: string,
	services: T[],
	serverId: string | null,
): T | undefined => {
	let best: T | undefined;
	let bestScore = -1;

	for (const service of services) {
		if ((service.serverId ?? null) !== serverId) continue;
		const score = getContainerServiceMatchScore(containerName, service.appName);
		if (score > bestScore) {
			bestScore = score;
			best = service;
		}
	}

	return best;
};

export const aggregateProjectContainerStats = (
	services: ProjectServiceRef[],
	containers: ContainerWithServer[],
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
		const matched = findBestMatchingService(
			container.Name || "",
			serviceStats,
			container.serverId,
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

const collectContainersForServers = async (
	serverIds: Array<string | null>,
): Promise<ContainerWithServer[]> => {
	if (serverIds.length === 0) return [];

	const batches = await Promise.all(
		serverIds.map(async (serverId) => {
			const stats = (await getAllContainerStats(
				serverId ?? undefined,
			)) as Container[];
			return stats.map((stat) => ({
				...stat,
				serverId,
			}));
		}),
	);

	return batches.flat();
};

export const getProjectResourceStats = async (
	projectId: string,
	options?: { accessedServices?: string[] },
): Promise<ProjectResourceStats> => {
	const project = await findProjectById(projectId);
	const services = collectProjectServices(project, options?.accessedServices);
	const serverIds = [...new Set(services.map((service) => service.serverId))];
	const containers = await collectContainersForServers(serverIds);
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
