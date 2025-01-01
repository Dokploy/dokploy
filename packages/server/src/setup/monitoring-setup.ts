import { findServerById } from "@dokploy/server/services/server";
import type { ContainerCreateOptions } from "dockerode";
import { pullRemoteImage } from "../utils/docker/utils";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const setupMonitoring = async (serverId: string) => {
	const server = await findServerById(serverId);

	const containerName = "mauricio-monitoring";
	const imageName = "siumauricio/monitoring:canary";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Env: [
			`REFRESH_RATE_SERVER=${server.serverRefreshRateMetrics * 1000}`,
			`CONTAINER_REFRESH_RATE=${server.containerRefreshRateMetrics * 1000}`,
			`CONTAINER_MONITORING_CONFIG=${JSON.stringify(
				server?.containersMetricsDefinition,
			)}`,
			`PORT=${server.defaultPortMetrics}`,
		],
		Image: imageName,
		HostConfig: {
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
				"/etc/dokploy/monitoring:/etc/dokploy/monitoring",
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
