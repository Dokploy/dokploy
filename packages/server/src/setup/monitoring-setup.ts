import { findServerById } from "@dokploy/server/services/server";
import type { CreateServiceOptions } from "dockerode";
import { pullRemoteImage } from "../utils/docker/utils";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const setupMonitoring = async (serverId: string) => {
	const server = await findServerById(serverId);

	const containerName = "mauricio-monitoring";
	const imageName = "siumauricio/monitoring:canary";

	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: [
					`REFRESH_RATE_SERVER=${server.refreshRateMetrics}`,
					`PORT=${server.defaultPortMetrics}`,
				],
				Mounts: [
					// {
					// 	Type: "bind",
					// 	// Source: `${MAIN_TRAEFIK_PATH}/traefik.yml`,
					// 	Target: "/etc/traefik/traefik.yml",
					// },
					// {
					// 	Type: "bind",
					// 	Source: DYNAMIC_TRAEFIK_PATH,
					// 	Target: "/etc/dokploy/traefik/dynamic",
					// },
					{
						Type: "bind",
						Source: "/proc",
						Target: "/host/proc",
					},
					{
						Type: "bind",
						Source: "/sys/class/net",
						Target: "/host/sys/class/net",
					},
					{
						Type: "bind",
						Source: "/var/run/docker.sock",
						Target: "/var/run/docker.sock",
					},
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
		EndpointSpec: {
			Ports: [
				{
					TargetPort: server.defaultPortMetrics,
					PublishedPort: server.defaultPortMetrics,
					PublishMode: "host",
				},
			],
		},
	};
	const docker = await getRemoteDocker(serverId);
	try {
		if (serverId) {
			await pullRemoteImage(imageName, serverId);
		}

		const service = docker.getService(containerName);
		const inspect = await service.inspect();

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
		});

		console.log("Monitoring Started ✅");
	} catch (error) {
		await docker.createService(settings);
		console.log("Monitoring Not Found: Starting ✅");
	}
};
