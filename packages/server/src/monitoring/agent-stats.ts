export interface AgentHostUsage {
	cpu: number;
	memUsedGB: number;
	memTotalGB: number;
}

const CONFIG_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 2_500;
// docker_gwbridge: where a container on this node finds the node itself when
// the server's public address isn't reachable from inside.
const GATEWAY_HOST = "172.18.0.1";

let cachedConfig:
	| { at: number; hosts: string[]; port: number; token: string }
	| undefined;
let lastWorkingHost: string | undefined;

const loadConfig = async () => {
	if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL_MS) {
		return cachedConfig;
	}
	const { getWebServerSettings } = await import(
		"../services/web-server-settings"
	);
	const settings = await getWebServerSettings();
	const server = settings?.metricsConfig?.server;
	if (!server?.port || !server.token) return undefined;
	cachedConfig = {
		at: Date.now(),
		hosts: [
			...new Set([settings?.serverIp, GATEWAY_HOST].filter(Boolean)),
		] as string[],
		port: server.port,
		token: server.token,
	};
	return cachedConfig;
};

/**
 * Inside the Dokploy container /proc is the physical machine's, so on a VM or
 * LXC guest the node-os-utils figures describe a bigger computer than the
 * server. The metrics agent mounts the host's own /proc and cgroup and reports
 * the server's real CPU and memory. Null when the agent can't be reached, so
 * the caller keeps its own numbers.
 */
export const getAgentHostUsage = async (): Promise<AgentHostUsage | null> => {
	try {
		const config = await loadConfig();
		if (!config) return null;
		const hosts = lastWorkingHost
			? [lastWorkingHost, ...config.hosts.filter((h) => h !== lastWorkingHost)]
			: config.hosts;
		for (const host of hosts) {
			try {
				const response = await fetch(
					`http://${host}:${config.port}/metrics/live`,
					{
						headers: { Authorization: `Bearer ${config.token}` },
						signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
					},
				);
				if (!response.ok) continue;
				const body = (await response.json()) as {
					cpu?: string;
					memUsedGB?: string;
					memTotal?: string;
				};
				const usage = {
					cpu: Number.parseFloat(body.cpu ?? ""),
					memUsedGB: Number.parseFloat(body.memUsedGB ?? ""),
					memTotalGB: Number.parseFloat(body.memTotal ?? ""),
				};
				if (
					!Number.isFinite(usage.cpu) ||
					!Number.isFinite(usage.memUsedGB) ||
					!(usage.memTotalGB > 0)
				) {
					continue;
				}
				lastWorkingHost = host;
				return usage;
			} catch {}
		}
		return null;
	} catch {
		return null;
	}
};
