import { findServerById } from "@dokploy/server/services/server";
import type { ContainerCreateOptions } from "dockerode";
import { pullImage, pullRemoteImage } from "../utils/docker/utils";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import { findAdminById } from "../services/admin";

export const setupMonitoring = async (serverId: string) => {
	const server = await findServerById(serverId);

	const containerName = "mauricio-monitoring";
	const imageName = "siumauricio/monitoring:canary";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Env: [
			`REFRESH_RATE_SERVER=${server.serverRefreshRateMetrics}`,
			`CONTAINER_REFRESH_RATE=${server.containerRefreshRateMetrics}`,
			`CONTAINER_MONITORING_CONFIG=${JSON.stringify(
				server?.containersMetricsDefinition,
			)}`,
			`PORT=${server.defaultPortMetrics}`,
			`METRICS_TOKEN=${server.metricsToken}`,
			`METRICS_URL_CALLBACK=${server.metricsUrlCallback}`,
		],
		Image: imageName,
		HostConfig: {
			// Memory: 100 * 1024 * 1024, // 100MB en bytes
			// PidMode: "host",
			// CapAdd: ["NET_ADMIN", "SYS_ADMIN"],
			// Privileged: true,
			PortBindings: {
				[`${server.defaultPortMetrics}/tcp`]: [
					{
						HostPort: server.defaultPortMetrics.toString(),
					},
				],
			},
			Binds: [
				"/var/run/docker.sock:/var/run/docker.sock:ro",
				"/sys:/host/sys:ro",
				"/etc/os-release:/etc/os-release:ro",
				"/proc:/host/proc:ro",
				"/etc/dokploy/monitoring/monitoring.db:/app/monitoring.db",
			],
			NetworkMode: "host",
		},
		ExposedPorts: {
			[`${server.defaultPortMetrics}/tcp`]: {},
		},
	};
	const docker = await getRemoteDocker(serverId);
	try {
		if (serverId) {
			await pullRemoteImage(imageName, serverId);
		}

		// Check if container exists
		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing container");
		} catch (error) {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Monitoring Started ");
	} catch (error) {
		console.log("Monitoring Not Found: Starting ");
	}
};

export const setupWebMonitoring = async (adminId: string) => {
	const admin = await findAdminById(adminId);

	const containerName = "mauricio-monitoring";
	const imageName = "siumauricio/monitoring:canary";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Env: [
			`REFRESH_RATE_SERVER=${admin.serverRefreshRateMetrics}`,
			`CONTAINER_REFRESH_RATE=${admin.containerRefreshRateMetrics}`,
			`CONTAINER_MONITORING_CONFIG=${JSON.stringify(
				admin?.containersMetricsDefinition,
			)}`,
			`PORT=${admin.defaultPortMetrics}`,
			`METRICS_TOKEN=${admin.metricsToken}`,
			`METRICS_URL_CALLBACK=${admin.metricsUrlCallback}`,
		],
		Image: imageName,
		HostConfig: {
			// Memory: 100 * 1024 * 1024, // 100MB en bytes
			// PidMode: "host",
			// CapAdd: ["NET_ADMIN", "SYS_ADMIN"],
			// Privileged: true,
			PortBindings: {
				[`${admin.defaultPortMetrics}/tcp`]: [
					{
						HostPort: admin.defaultPortMetrics.toString(),
					},
				],
			},
			Binds: [
				"/var/run/docker.sock:/var/run/docker.sock:ro",
				"/sys:/host/sys:ro",
				"/etc/os-release:/etc/os-release:ro",
				"/proc:/host/proc:ro",
				"/etc/dokploy/monitoring/monitoring.db:/app/monitoring.db",
			],
			// NetworkMode: "host",
		},
		ExposedPorts: {
			[`${admin.defaultPortMetrics}/tcp`]: {},
		},
	};
	const docker = await getRemoteDocker();
	try {
		await pullImage(imageName);

		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing container");
		} catch (error) {}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Monitoring Started ");
	} catch (error) {
		console.log("Monitoring Not Found: Starting ");
	}
};
