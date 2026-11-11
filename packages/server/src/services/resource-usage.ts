import { toMb } from "../monitoring/units";
import {
	COMPOSE_PROJECT_LABEL,
	type ContainerWithLabels,
	getAllContainerStats,
	getAllContainersWithLabels,
	STACK_NAMESPACE_LABEL,
	SWARM_SERVICE_LABEL,
} from "./docker";

export type ResourceServiceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

export interface ServiceDescriptor {
	id: string;
	name: string;
	appName: string;
	type: ResourceServiceType;
	composeType?: "docker-compose" | "stack";
	status: string | null;
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
}

export interface ContainerUsage {
	containerId: string;
	containerName: string;
	state: string;
	cpuPercent: number;
	memUsedMb: number;
	memLimitMb: number;
	netInputMb: number;
	netOutputMb: number;
	blockReadMb: number;
	blockWriteMb: number;
	diskUsedMb: number;
}

export interface ServiceUsage extends ServiceDescriptor {
	containers: ContainerUsage[];
	cpuPercent: number;
	memUsedMb: number;
	memLimitMb: number;
	diskUsedMb: number;
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

const isContainerForService = (
	container: ContainerWithLabels,
	service: ServiceDescriptor,
): boolean => {
	const { labels } = container;

	if (service.type === "compose" && service.composeType === "docker-compose") {
		return labels[COMPOSE_PROJECT_LABEL] === service.appName;
	}

	if (service.type === "compose" && service.composeType === "stack") {
		return (
			labels[STACK_NAMESPACE_LABEL] === service.appName ||
			(labels[SWARM_SERVICE_LABEL]?.startsWith(`${service.appName}_`) ?? false)
		);
	}

	return labels[SWARM_SERVICE_LABEL] === service.appName;
};

const toContainerUsage = (
	container: ContainerWithLabels,
	statsByName: Map<string, Record<string, string>>,
): ContainerUsage => {
	const stat = statsByName.get(container.name);
	const [usedRaw, limitRaw] = (stat?.MemUsage ?? "0MB / 0MB").split(" / ");
	const [inputRaw, outputRaw] = (stat?.NetIO ?? "0MB / 0MB").split(" / ");
	const [readRaw, writeRaw] = (stat?.BlockIO ?? "0MB / 0MB").split(" / ");

	return {
		containerId: container.containerId,
		containerName: container.name,
		state: container.state,
		cpuPercent: Number.parseFloat(stat?.CPUPerc ?? "0") || 0,
		memUsedMb: toMb(usedRaw),
		memLimitMb: toMb(limitRaw),
		netInputMb: toMb(inputRaw),
		netOutputMb: toMb(outputRaw),
		blockReadMb: toMb(readRaw),
		blockWriteMb: toMb(writeRaw),
		diskUsedMb: container.sizeMb,
	};
};

/**
 * Correlates registered Dokploy services with live container stats on a
 * single host. Only two `docker` commands are run in total (one for all
 * container labels, one for all container stats) no matter how many
 * services are passed in, so this stays cheap as a project grows.
 */
export const getResourceUsage = async (
	services: ServiceDescriptor[],
	serverId?: string,
): Promise<ServiceUsage[]> => {
	const [containers, stats] = await Promise.all([
		getAllContainersWithLabels(serverId),
		getAllContainerStats(serverId),
	]);

	const statsByName = new Map<string, Record<string, string>>(
		stats.map((stat) => [stat.Name, stat]),
	);

	return services.map((service) => {
		const matched = containers.filter((container) =>
			isContainerForService(container, service),
		);
		const containerUsages = matched.map((container) =>
			toContainerUsage(container, statsByName),
		);

		return {
			...service,
			containers: containerUsages,
			cpuPercent: sum(containerUsages.map((c) => c.cpuPercent)),
			memUsedMb: sum(containerUsages.map((c) => c.memUsedMb)),
			memLimitMb: Math.max(0, ...containerUsages.map((c) => c.memLimitMb)),
			diskUsedMb: sum(containerUsages.map((c) => c.diskUsedMb)),
		};
	});
};
