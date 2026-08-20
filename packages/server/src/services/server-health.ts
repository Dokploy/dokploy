import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	environments,
	projects,
} from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export interface NetworkIpUsage {
	name: string;
	driver: string;
	subnet: string | null;
	containersInUse: number;
	capacity: number | null;
	percentUsed: number | null;
}

export interface ServerHealthResult {
	checkedAt: string;
	containers: {
		containerCount: number;
		serviceCount: number;
	};
	resources: {
		memTotalBytes: number;
		memUsedBytes: number;
		cpuCount: number;
	};
	inotify: {
		maxWatches: number;
		maxInstances: number;
		maxQueuedEvents: number;
		currentInstances: number;
		persisted: boolean;
	};
	disk: {
		totalBytes: number;
		usedBytes: number;
	};
	dockerNetworks: {
		count: number;
		addressPools: unknown | null;
		/** Per-network IP utilization, including reserved networks like dokploy-network */
		usage: NetworkIpUsage[];
		/** Set when `usage` couldn't be read, so the UI can tell that apart from "no networks" */
		usageError?: string;
	};
	daemonErrors: string[];
	/** The window actually passed to `journalctl --since`, computed on the target machine's clock */
	daemonLogsWindow: { fromEpoch: number; toEpoch: number } | null;
	reservation: {
		memoryReservedBytes: number;
		cpuReservedNanoCpus: number;
		appCount: number;
		unsupportedComposeCount: number;
	} | null;
	error?: string;
}

interface RawHealthOutput {
	containerCount?: number | string;
	serviceCount?: number | string;
	memTotalBytes?: number | string;
	memUsedBytes?: number | string;
	cpuCount?: number | string;
	inotifyMaxWatches?: number | string;
	inotifyMaxInstances?: number | string;
	inotifyMaxQueuedEvents?: number | string;
	inotifyCurrentInstances?: number | string;
	inotifyPersistedCount?: number | string;
	diskTotalBytes?: number | string;
	diskUsedBytes?: number | string;
	networkCount?: number | string;
	daemonConfigBase64?: string;
	daemonErrorsBase64?: string;
	daemonLogsFromEpoch?: number | string;
	daemonLogsToEpoch?: number | string;
}

const toInt = (value: unknown): number => {
	const n = Number.parseInt(String(value ?? "0"), 10);
	return Number.isFinite(n) ? n : 0;
};

const b64Decode = (value?: string): string => {
	if (!value) return "";
	try {
		return Buffer.from(value, "base64").toString("utf-8");
	} catch {
		return "";
	}
};

// Single read-only script, one SSH/exec round-trip; each check falls back to 0/empty on its own.
const buildHealthScript = (sinceHours: number) => `
containerCount=$(docker ps -a -q 2>/dev/null | wc -l | tr -d ' ')
serviceCount=$(docker service ls --format '{{.Name}}' 2>/dev/null | wc -l | tr -d ' ')

memTotal=$(free -b 2>/dev/null | awk '/^Mem:/{print $2}'); [ -z "$memTotal" ] && memTotal=0
memUsed=$(free -b 2>/dev/null | awk '/^Mem:/{print $3}'); [ -z "$memUsed" ] && memUsed=0
cpuCount=$(nproc 2>/dev/null); [ -z "$cpuCount" ] && cpuCount=0

inotifyMaxWatches=$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null); [ -z "$inotifyMaxWatches" ] && inotifyMaxWatches=0
inotifyMaxInstances=$(cat /proc/sys/fs/inotify/max_user_instances 2>/dev/null); [ -z "$inotifyMaxInstances" ] && inotifyMaxInstances=0
inotifyMaxQueued=$(cat /proc/sys/fs/inotify/max_queued_events 2>/dev/null); [ -z "$inotifyMaxQueued" ] && inotifyMaxQueued=0
inotifyCurrentInstances=$(find /proc/*/fd -lname 'anon_inode:inotify*' 2>/dev/null | wc -l | tr -d ' ')
inotifyPersistedCount=$(grep -rl inotify /etc/sysctl.conf /etc/sysctl.d/ 2>/dev/null | wc -l | tr -d ' ')

diskTotal=$(df -B1 / 2>/dev/null | awk 'NR==2{print $2}'); [ -z "$diskTotal" ] && diskTotal=0
diskUsed=$(df -B1 / 2>/dev/null | awk 'NR==2{print $3}'); [ -z "$diskUsed" ] && diskUsed=0

networkCount=$(docker network ls -q 2>/dev/null | wc -l | tr -d ' ')
daemonConfigB64=$(cat /etc/docker/daemon.json 2>/dev/null | base64 2>/dev/null | tr -d '\\n')

daemonLogsToEpoch=$(date +%s 2>/dev/null); [ -z "$daemonLogsToEpoch" ] && daemonLogsToEpoch=0
daemonLogsFromEpoch=$((daemonLogsToEpoch - ${sinceHours} * 3600))

daemonErrorsB64=$(journalctl -u docker --no-pager --since "${sinceHours} hours ago" 2>/dev/null | grep -iE "inotify|too many open|cannot allocate|oom|conntrack|no space|pids.max|fork:|resource temporarily unavailable|could not find an available ip|no available ip|task allocation failure|address already in use" | tail -n 50 | base64 2>/dev/null | tr -d '\\n')

printf '{"containerCount":%s,"serviceCount":%s,"memTotalBytes":%s,"memUsedBytes":%s,"cpuCount":%s,"inotifyMaxWatches":%s,"inotifyMaxInstances":%s,"inotifyMaxQueuedEvents":%s,"inotifyCurrentInstances":%s,"inotifyPersistedCount":%s,"diskTotalBytes":%s,"diskUsedBytes":%s,"networkCount":%s,"daemonConfigBase64":"%s","daemonErrorsBase64":"%s","daemonLogsFromEpoch":%s,"daemonLogsToEpoch":%s}' "$containerCount" "$serviceCount" "$memTotal" "$memUsed" "$cpuCount" "$inotifyMaxWatches" "$inotifyMaxInstances" "$inotifyMaxQueued" "$inotifyCurrentInstances" "$inotifyPersistedCount" "$diskTotal" "$diskUsed" "$networkCount" "$daemonConfigB64" "$daemonErrorsB64" "$daemonLogsFromEpoch" "$daemonLogsToEpoch"
`;

const emptyResult = (error: unknown): ServerHealthResult => ({
	checkedAt: new Date().toISOString(),
	containers: { containerCount: 0, serviceCount: 0 },
	resources: { memTotalBytes: 0, memUsedBytes: 0, cpuCount: 0 },
	inotify: {
		maxWatches: 0,
		maxInstances: 0,
		maxQueuedEvents: 0,
		currentInstances: 0,
		persisted: false,
	},
	disk: { totalBytes: 0, usedBytes: 0 },
	dockerNetworks: { count: 0, addressPools: null, usage: [] },
	daemonErrors: [],
	daemonLogsWindow: null,
	reservation: null,
	error:
		error instanceof Error ? error.message : "Could not read server health",
});

/** Usable host addresses in a subnet, excluding network + broadcast. Null if the subnet is missing/invalid. */
export const getSubnetCapacity = (
	subnet: string | undefined,
): number | null => {
	if (!subnet) return null;
	const prefix = Number.parseInt(subnet.split("/")[1] ?? "", 10);
	if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return null;
	const hostBits = 32 - prefix;
	if (hostBits <= 1) return 0;
	return 2 ** hostBits - 2;
};

type DockerNetworkSummary = {
	Name: string;
	Driver: string;
	IPAM?: { Config?: Array<{ Subnet?: string }> | null };
};

type InspectableNetwork = {
	inspect: (opts?: { verbose?: boolean }) => Promise<{
		Containers?: Record<string, unknown>;
	}>;
};

// Includes reserved networks like dokploy-network, which are excluded from the `network` table/UI.
const getNetworksIpUsage = async (
	serverId: string | undefined,
): Promise<NetworkIpUsage[]> => {
	const docker = await getRemoteDocker(serverId);
	const dockerNetworks =
		(await docker.listNetworks()) as DockerNetworkSummary[];
	const relevant = dockerNetworks.filter(
		(n) => n.Driver === "bridge" || n.Driver === "overlay",
	);

	const rows = await Promise.all(
		relevant.map(async (n): Promise<NetworkIpUsage> => {
			// IPv4 entry specifically: dual-stack networks list an IPv6 config too, and it may come first.
			const subnet = n.IPAM?.Config?.find(
				(c) => c.Subnet && !c.Subnet.includes(":"),
			)?.Subnet;
			const capacity = getSubnetCapacity(subnet);
			let containersInUse = 0;
			try {
				// Cast the object (not the detached method) so `net.inspect(...)` stays a bound method call.
				const net = docker.getNetwork(n.Name) as unknown as InspectableNetwork;
				// verbose: true for full swarm-wide container list on overlay networks
				const info = await net.inspect(
					n.Driver === "overlay" ? { verbose: true } : undefined,
				);
				containersInUse = Object.keys(info.Containers ?? {}).length;
			} catch {
				// Network may have disappeared between list and inspect; report 0
			}
			return {
				name: n.Name,
				driver: n.Driver,
				subnet: subnet ?? null,
				containersInUse,
				capacity,
				percentUsed:
					capacity && capacity > 0
						? Math.round((containersInUse / capacity) * 100)
						: null,
			};
		}),
	);

	return rows.sort((a, b) => (b.percentUsed ?? -1) - (a.percentUsed ?? -1));
};

// Sums Application memoryReservation/cpuReservation; Compose has no such columns.
export const getReservationSummary = async (
	orgId: string,
	serverId?: string,
) => {
	const appRows = await db
		.select({
			memoryReservation: applications.memoryReservation,
			cpuReservation: applications.cpuReservation,
		})
		.from(applications)
		.innerJoin(
			environments,
			eq(applications.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(
			and(
				eq(projects.organizationId, orgId),
				serverId
					? eq(applications.serverId, serverId)
					: isNull(applications.serverId),
			),
		);

	let memoryReservedBytes = 0;
	let cpuReservedNanoCpus = 0;
	for (const row of appRows) {
		if (row.memoryReservation) {
			memoryReservedBytes += toInt(row.memoryReservation);
		}
		if (row.cpuReservation) {
			cpuReservedNanoCpus += toInt(row.cpuReservation);
		}
	}

	const composeRows = await db
		.select({ composeId: compose.composeId })
		.from(compose)
		.innerJoin(
			environments,
			eq(compose.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(
			and(
				eq(projects.organizationId, orgId),
				serverId ? eq(compose.serverId, serverId) : isNull(compose.serverId),
			),
		);

	return {
		memoryReservedBytes,
		cpuReservedNanoCpus,
		appCount: appRows.length,
		unsupportedComposeCount: composeRows.length,
	};
};

export const getServerHealth = async (
	orgId: string,
	serverId?: string,
	sinceHours = 24,
): Promise<ServerHealthResult> => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required",
		});
	}

	const hours = Math.max(
		1,
		Math.min(168, Math.floor(Number(sinceHours) || 24)),
	);
	const script = buildHealthScript(hours);

	let stdout = "";
	try {
		const result = serverId
			? await execAsyncRemote(serverId, script)
			: await execAsync(script);
		stdout = result.stdout;
	} catch (error) {
		return emptyResult(error);
	}

	let parsed: RawHealthOutput;
	try {
		parsed = JSON.parse(stdout.trim());
	} catch {
		return emptyResult(new Error("Could not parse server health output"));
	}

	const daemonErrors = b64Decode(parsed.daemonErrorsBase64)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	let addressPools: unknown = null;
	const daemonConfigText = b64Decode(parsed.daemonConfigBase64);
	if (daemonConfigText) {
		try {
			addressPools =
				JSON.parse(daemonConfigText)?.["default-address-pools"] ?? null;
		} catch {
			addressPools = null;
		}
	}

	// Not part of the shell script above: needs structured per-network data from the Docker API.
	const [reservation, networkUsageResult] = await Promise.all([
		getReservationSummary(orgId, serverId).catch(() => null),
		getNetworksIpUsage(serverId).then(
			(usage) => ({ usage, error: undefined }),
			(error: unknown) => ({
				usage: [] as NetworkIpUsage[],
				error:
					error instanceof Error
						? error.message
						: "Failed to read network usage",
			}),
		),
	]);

	return {
		checkedAt: new Date().toISOString(),
		containers: {
			containerCount: toInt(parsed.containerCount),
			serviceCount: toInt(parsed.serviceCount),
		},
		resources: {
			memTotalBytes: toInt(parsed.memTotalBytes),
			memUsedBytes: toInt(parsed.memUsedBytes),
			cpuCount: toInt(parsed.cpuCount),
		},
		inotify: {
			maxWatches: toInt(parsed.inotifyMaxWatches),
			maxInstances: toInt(parsed.inotifyMaxInstances),
			maxQueuedEvents: toInt(parsed.inotifyMaxQueuedEvents),
			currentInstances: toInt(parsed.inotifyCurrentInstances),
			persisted: toInt(parsed.inotifyPersistedCount) > 0,
		},
		disk: {
			totalBytes: toInt(parsed.diskTotalBytes),
			usedBytes: toInt(parsed.diskUsedBytes),
		},
		dockerNetworks: {
			count: toInt(parsed.networkCount),
			addressPools,
			usage: networkUsageResult.usage,
			usageError: networkUsageResult.error,
		},
		daemonErrors,
		daemonLogsWindow:
			toInt(parsed.daemonLogsToEpoch) > 0
				? {
						fromEpoch: toInt(parsed.daemonLogsFromEpoch),
						toEpoch: toInt(parsed.daemonLogsToEpoch),
					}
				: null,
		reservation,
	};
};
