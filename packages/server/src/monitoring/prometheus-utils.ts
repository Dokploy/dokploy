import { findServerById } from "@dokploy/server/services/server";

/**
 * Query Prometheus for metrics
 */
export const queryPrometheus = async (
	query: string,
	serverId?: string,
	time?: string,
): Promise<any> => {
	const prometheusUrl = await getPrometheusUrl(serverId);
	const endpoint = time
		? `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}&time=${time}`
		: `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`;

	try {
		const response = await fetch(endpoint);
		if (!response.ok) {
			throw new Error(`Prometheus query failed: ${response.statusText}`);
		}
		return await response.json();
	} catch (error) {
		console.error("Failed to query Prometheus:", error);
		throw error;
	}
};

/**
 * Query Prometheus for range data
 */
export const queryPrometheusRange = async (
	query: string,
	start: string,
	end: string,
	step: string,
	serverId?: string,
): Promise<any> => {
	const prometheusUrl = await getPrometheusUrl(serverId);
	const endpoint = `${prometheusUrl}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;

	try {
		const response = await fetch(endpoint);
		if (!response.ok) {
			throw new Error(`Prometheus range query failed: ${response.statusText}`);
		}
		return await response.json();
	} catch (error) {
		console.error("Failed to query Prometheus range:", error);
		throw error;
	}
};

/**
 * Get Prometheus URL based on server configuration
 */
const getPrometheusUrl = async (serverId?: string): Promise<string> => {
	if (serverId) {
		const server = await findServerById(serverId);
		return `http://${server.ipAddress}:9090`;
	}
	return "http://localhost:9090";
};

/**
 * Get CPU metrics from Prometheus
 */
export const getCPUMetrics = async (serverId?: string, timeRange = "5m") => {
	const query = `100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[${timeRange}])) * 100)`;
	return await queryPrometheus(query, serverId);
};

/**
 * Get memory metrics from Prometheus
 */
export const getMemoryMetrics = async (serverId?: string) => {
	const query =
		"(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100";
	return await queryPrometheus(query, serverId);
};

/**
 * Get disk metrics from Prometheus
 */
export const getDiskMetrics = async (serverId?: string) => {
	const query = `100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"})`;
	return await queryPrometheus(query, serverId);
};

/**
 * Get network metrics from Prometheus
 */
export const getNetworkMetrics = async (
	serverId?: string,
	timeRange = "5m",
) => {
	const receiveQuery = `rate(node_network_receive_bytes_total[${timeRange}])`;
	const transmitQuery = `rate(node_network_transmit_bytes_total[${timeRange}])`;

	const [receive, transmit] = await Promise.all([
		queryPrometheus(receiveQuery, serverId),
		queryPrometheus(transmitQuery, serverId),
	]);

	return { receive, transmit };
};

/**
 * Get container CPU metrics from cAdvisor
 */
export const getContainerCPUMetrics = async (
	containerName: string,
	serverId?: string,
	timeRange = "5m",
) => {
	const query = `rate(container_cpu_usage_seconds_total{name="${containerName}"}[${timeRange}]) * 100`;
	return await queryPrometheus(query, serverId);
};

/**
 * Get container memory metrics from cAdvisor
 */
export const getContainerMemoryMetrics = async (
	containerName: string,
	serverId?: string,
) => {
	const query = `container_memory_usage_bytes{name="${containerName}"}`;
	return await queryPrometheus(query, serverId);
};

/**
 * Get container network metrics from cAdvisor
 */
export const getContainerNetworkMetrics = async (
	containerName: string,
	serverId?: string,
	timeRange = "5m",
) => {
	const receiveQuery = `rate(container_network_receive_bytes_total{name="${containerName}"}[${timeRange}])`;
	const transmitQuery = `rate(container_network_transmit_bytes_total{name="${containerName}"}[${timeRange}])`;

	const [receive, transmit] = await Promise.all([
		queryPrometheus(receiveQuery, serverId),
		queryPrometheus(transmitQuery, serverId),
	]);

	return { receive, transmit };
};

/**
 * Get all system metrics
 */
export const getSystemMetrics = async (serverId?: string) => {
	const [cpu, memory, disk, network] = await Promise.all([
		getCPUMetrics(serverId),
		getMemoryMetrics(serverId),
		getDiskMetrics(serverId),
		getNetworkMetrics(serverId),
	]);

	return {
		cpu,
		memory,
		disk,
		network,
	};
};

/**
 * Get all container metrics
 */
export const getContainerMetrics = async (
	containerName: string,
	serverId?: string,
) => {
	const [cpu, memory, network] = await Promise.all([
		getContainerCPUMetrics(containerName, serverId),
		getContainerMemoryMetrics(containerName, serverId),
		getContainerNetworkMetrics(containerName, serverId),
	]);

	return {
		cpu,
		memory,
		network,
	};
};

/**
 * Check if Prometheus is healthy
 */
export const checkPrometheusHealth = async (
	serverId?: string,
): Promise<boolean> => {
	const prometheusUrl = await getPrometheusUrl(serverId);

	try {
		const response = await fetch(`${prometheusUrl}/-/healthy`);
		return response.ok;
	} catch (error) {
		console.error("Prometheus health check failed:", error);
		return false;
	}
};
