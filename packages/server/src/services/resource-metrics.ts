import { promises as fs } from "node:fs";
import path from "node:path";
import { paths } from "../constants";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";

export type ResourceMetricServiceType =
	| "application"
	| "compose"
	| "libsql"
	| "mariadb"
	| "mongo"
	| "mysql"
	| "postgres"
	| "redis";

export type ResourceMetricService = {
	serviceId: string;
	type: ResourceMetricServiceType;
	appName: string;
	serverId?: string | null;
};

export type ResourceMetricSnapshot = {
	time: string;
	cpuPercent: number;
	memoryBytes: number;
	memoryLimitBytes: number;
	blockReadBytes: number;
	blockWriteBytes: number;
	networkRxBytes: number;
	networkTxBytes: number;
	containers: number;
};

export type ResourceMetricSummary = {
	current: ResourceMetricSnapshot | null;
	history: ResourceMetricSnapshot[];
	unavailable?: boolean;
};

export type DockerStatsRow = {
	BlockIO?: string;
	CPUPerc?: string;
	ID?: string;
	MemUsage?: string;
	Name?: string;
	NetIO?: string;
};

export type DockerContainerLabels = {
	id: string;
	name: string;
	swarmServiceName: string;
	composeProject: string;
	stackNamespace: string;
};

export type ResourceMetricDockerClient = {
	getStats: (serverId?: string) => Promise<DockerStatsRow[]>;
	listContainers: (
		serverId?: string | null,
	) => Promise<DockerContainerLabels[]>;
};

const HISTORY_LIMIT = 120;
const MIN_SAMPLE_INTERVAL_MS = 30_000;
const dockerStatsCommand =
	'docker stats --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'';
const containerLabelsCommand =
	'docker ps --format \'{{.ID}}\\t{{.Names}}\\t{{.Label "com.docker.swarm.service.name"}}\\t{{.Label "com.docker.compose.project"}}\\t{{.Label "com.docker.stack.namespace"}}\'';
const historyWriteLocks = new Map<string, Promise<unknown>>();

const emptySnapshot = (): ResourceMetricSnapshot => ({
	time: new Date().toISOString(),
	cpuPercent: 0,
	memoryBytes: 0,
	memoryLimitBytes: 0,
	blockReadBytes: 0,
	blockWriteBytes: 0,
	networkRxBytes: 0,
	networkTxBytes: 0,
	containers: 0,
});

const parsePercent = (value?: string) => {
	const parsed = Number.parseFloat(value?.replace("%", "") ?? "0");
	return Number.isFinite(parsed) ? parsed : 0;
};

const parseBytes = (value?: string) => {
	if (!value) return 0;
	const normalized = value.trim().replace(",", ".").toLowerCase();
	const match = normalized.match(/^([0-9.]+)\s*([kmgtp]?i?b?)?$/);
	if (!match) return 0;

	const amount = Number.parseFloat(match[1] ?? "0");
	if (!Number.isFinite(amount)) return 0;

	const unit = match[2] || "b";
	const multipliers: Record<string, number> = {
		b: 1,
		kb: 1000,
		mb: 1000 ** 2,
		gb: 1000 ** 3,
		tb: 1000 ** 4,
		pb: 1000 ** 5,
		kib: 1024,
		mib: 1024 ** 2,
		gib: 1024 ** 3,
		tib: 1024 ** 4,
		pib: 1024 ** 5,
	};

	return amount * (multipliers[unit] ?? 1);
};

const parsePair = (value?: string) => {
	const [left, right] = value?.split("/") ?? [];
	return {
		left: parseBytes(left),
		right: parseBytes(right),
	};
};

export const parseDockerStatsOutput = (stdout: string) => {
	if (!stdout.trim()) return [];

	return stdout
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as DockerStatsRow);
};

export const parseDockerContainerLabelsOutput = (stdout: string) => {
	if (!stdout.trim()) return [];

	return stdout
		.trim()
		.split("\n")
		.map((line) => {
			const [id, name, swarmServiceName, composeProject, stackNamespace] =
				line.split("\t");
			return {
				id: id ?? "",
				name: name ?? "",
				swarmServiceName: swarmServiceName ?? "",
				composeProject: composeProject ?? "",
				stackNamespace: stackNamespace ?? "",
			};
		});
};

const findStatsForContainer = (
	stats: DockerStatsRow[],
	containerId: string,
	containerName: string,
) =>
	stats.find((item) => {
		const id = item.ID ?? "";
		const name = item.Name ?? "";
		const matchesId =
			id.length > 0 &&
			(id === containerId ||
				containerId.startsWith(id) ||
				id.startsWith(containerId));
		const matchesName = name.length > 0 && name === containerName;

		return matchesId || matchesName;
	});

const runDockerCommand = async (
	serverId: string | null | undefined,
	command: string,
) => {
	const result = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	return result.stdout;
};

const listContainerStats = async (serverId?: string | null) => {
	return parseDockerStatsOutput(
		await runDockerCommand(serverId, dockerStatsCommand),
	);
};

const listContainerLabels = async (serverId?: string | null) => {
	return parseDockerContainerLabelsOutput(
		await runDockerCommand(serverId, containerLabelsCommand),
	);
};

export const serviceOwnsContainer = (
	service: ResourceMetricService,
	container: DockerContainerLabels,
) => {
	if (service.type === "compose") {
		return (
			container.composeProject === service.appName ||
			container.stackNamespace === service.appName
		);
	}

	return (
		container.swarmServiceName === service.appName ||
		container.name.startsWith(`${service.appName}.`)
	);
};

export const aggregateDockerStatsRows = (rows: DockerStatsRow[]) => {
	const snapshot = emptySnapshot();
	snapshot.containers = rows.length;

	for (const row of rows) {
		const memory = parsePair(row.MemUsage);
		const block = parsePair(row.BlockIO);
		const network = parsePair(row.NetIO);

		snapshot.cpuPercent += parsePercent(row.CPUPerc);
		snapshot.memoryBytes += memory.left;
		snapshot.memoryLimitBytes += memory.right;
		snapshot.blockReadBytes += block.left;
		snapshot.blockWriteBytes += block.right;
		snapshot.networkRxBytes += network.left;
		snapshot.networkTxBytes += network.right;
	}

	return snapshot;
};

const defaultDockerClient: ResourceMetricDockerClient = {
	getStats: listContainerStats,
	listContainers: listContainerLabels,
};

const historyPath = (scope: "project" | "service", id: string) => {
	const { MONITORING_PATH } = paths();
	return path.join(MONITORING_PATH, "resources", scope, `${id}.json`);
};

export const readResourceMetricHistory = async (
	scope: "project" | "service",
	id: string,
) => {
	try {
		const data = await fs.readFile(historyPath(scope, id), "utf-8");
		return JSON.parse(data) as ResourceMetricSnapshot[];
	} catch {
		return [];
	}
};

const writeResourceMetricHistory = async (
	filePath: string,
	history: ResourceMetricSnapshot[],
) => {
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
		.toString(36)
		.slice(2)}.tmp`;

	try {
		await fs.writeFile(tempPath, JSON.stringify(history));
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
};

const withHistoryWriteLock = async <T>(
	filePath: string,
	operation: () => Promise<T>,
) => {
	const previous = historyWriteLocks.get(filePath) ?? Promise.resolve();
	const current = previous.catch(() => undefined).then(operation);
	const tracked = current.finally(() => {
		if (historyWriteLocks.get(filePath) === tracked) {
			historyWriteLocks.delete(filePath);
		}
	});

	historyWriteLocks.set(filePath, tracked);
	return current;
};

export const recordResourceMetricSnapshot = async (
	scope: "project" | "service",
	id: string,
	snapshot: ResourceMetricSnapshot,
) => {
	const filePath = historyPath(scope, id);
	await fs.mkdir(path.dirname(filePath), { recursive: true });

	return withHistoryWriteLock(filePath, async () => {
		const history = await readResourceMetricHistory(scope, id);
		const last = history.at(-1);
		const snapshotTime = new Date(snapshot.time).getTime();
		const lastTime = last ? new Date(last.time).getTime() : Number.NaN;
		const shouldReplaceLast =
			last &&
			Number.isFinite(snapshotTime) &&
			Number.isFinite(lastTime) &&
			Math.abs(snapshotTime - lastTime) < MIN_SAMPLE_INTERVAL_MS;

		const nextHistory = shouldReplaceLast
			? [...history.slice(0, -1), snapshot]
			: [...history, snapshot];
		const limitedHistory = [...nextHistory]
			.sort(
				(left, right) =>
					new Date(left.time).getTime() - new Date(right.time).getTime(),
			)
			.slice(-HISTORY_LIMIT);

		await writeResourceMetricHistory(filePath, limitedHistory);
		return limitedHistory;
	});
};

export const aggregateResourceMetricSnapshots = (
	snapshots: ResourceMetricSnapshot[],
) => {
	const aggregate = emptySnapshot();
	aggregate.time = new Date().toISOString();

	for (const snapshot of snapshots) {
		aggregate.cpuPercent += snapshot.cpuPercent;
		aggregate.memoryBytes += snapshot.memoryBytes;
		aggregate.memoryLimitBytes += snapshot.memoryLimitBytes;
		aggregate.blockReadBytes += snapshot.blockReadBytes;
		aggregate.blockWriteBytes += snapshot.blockWriteBytes;
		aggregate.networkRxBytes += snapshot.networkRxBytes;
		aggregate.networkTxBytes += snapshot.networkTxBytes;
		aggregate.containers += snapshot.containers;
	}

	return aggregate;
};

export const collectResourceMetricsForServices = async (
	services: ResourceMetricService[],
	dockerClient = defaultDockerClient,
) => {
	const summaries: Record<string, ResourceMetricSummary> = {};
	const servicesByServer = new Map<string, ResourceMetricService[]>();

	for (const service of services) {
		const serverKey = service.serverId ?? "dokploy";
		servicesByServer.set(serverKey, [
			...(servicesByServer.get(serverKey) ?? []),
			service,
		]);
	}

	for (const [serverKey, serverServices] of servicesByServer) {
		const serverId = serverKey === "dokploy" ? undefined : serverKey;
		let stats: DockerStatsRow[];
		let containers: DockerContainerLabels[];

		try {
			[stats, containers] = await Promise.all([
				dockerClient.getStats(serverId),
				dockerClient.listContainers(serverId),
			]);
		} catch (error) {
			console.error("collectResourceMetricsForServices error:", {
				serverId,
				error,
			});

			for (const service of serverServices) {
				const history = await readResourceMetricHistory(
					"service",
					service.serviceId,
				);
				summaries[service.serviceId] = {
					current: history.at(-1) ?? null,
					history,
					unavailable: true,
				};
			}
			continue;
		}

		for (const service of serverServices) {
			const serviceContainers = containers.filter((container) =>
				serviceOwnsContainer(service, container),
			);
			const rows = serviceContainers
				.map((container) =>
					findStatsForContainer(stats, container.id, container.name),
				)
				.filter((row): row is DockerStatsRow => Boolean(row));

			const current = aggregateDockerStatsRows(rows);
			const history = await recordResourceMetricSnapshot(
				"service",
				service.serviceId,
				current,
			);

			summaries[service.serviceId] = {
				current,
				history,
			};
		}
	}

	return summaries;
};
