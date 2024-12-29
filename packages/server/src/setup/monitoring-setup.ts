import { findServerById } from "@dokploy/server/services/server";
import type { ContainerCreateOptions, CreateServiceOptions } from "dockerode";
import { pullRemoteImage } from "../utils/docker/utils";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const setupMonitoring = async (serverId: string) => {
	const server = await findServerById(serverId);

	const containerName = "mauricio-monitoring";
	const imageName = "siumauricio/monitoring:canary";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Env: [
			`REFRESH_RATE_SERVER=${server.refreshRateMetrics * 1000}`,
			`PORT=${server.defaultPortMetrics}`,
		],
		Image: imageName,
		HostConfig: {
			PidMode: "host",
			CapAdd: ["NET_ADMIN", "SYS_ADMIN"],
			Privileged: true,
			PortBindings: {
				[`${server.defaultPortMetrics}/tcp`]: [
					{
						HostPort: server.defaultPortMetrics.toString(),
					},
				],
			},
			Binds: [
				// "/proc:/host/proc",
				// "/sys/class/net:/host/sys/class/net:ro",
				"/var/run/docker.sock:/var/run/docker.sock:ro",
				"/sys:/host/sys:ro",
				"/etc/os-release:/etc/os-release:ro",
				// "/sys/devices/system/cpu:/sys/devices/system/cpu:ro",
				// "/sys/class/dmi/id:/sys/class/dmi/id:ro",
				// "/etc/machine-id:/etc/machine-id:ro",
			],
			NetworkMode: "host",
		},
		ExposedPorts: {
			[`${server.defaultPortMetrics}/tcp`]: {},
		},

		// TaskTemplate: {
		// 	ContainerSpec: {
		// 		Env: [
		// 			`REFRESH_RATE_SERVER=${server.refreshRateMetrics}`,
		// 			`PORT=${server.defaultPortMetrics}`,
		// 		],
		// 		Mounts: [
		// 			// {
		// 			// 	Type: "bind",
		// 			// 	// Source: `${MAIN_TRAEFIK_PATH}/traefik.yml`,
		// 			// 	Target: "/etc/traefik/traefik.yml",
		// 			// },
		// 			// {
		// 			// 	Type: "bind",
		// 			// 	Source: DYNAMIC_TRAEFIK_PATH,
		// 			// 	Target: "/etc/dokploy/traefik/dynamic",
		// 			// },
		// 			{
		// 				Type: "bind",
		// 				Source: "/proc",
		// 				Target: "/host/proc",
		// 			},
		// 			{
		// 				Type: "bind",
		// 				Source: "/sys/class/net",
		// 				Target: "/host/sys/class/net",
		// 			},
		// 			{
		// 				Type: "bind",
		// 				Source: "/var/run/docker.sock",
		// 				Target: "/var/run/docker.sock",
		// 			},
		// 		],
		// 	},
		// 	Networks: [{ Target: "dokploy-network" }],
		// 	Placement: {
		// 		Constraints: ["node.role==manager"],
		// 	},
		// },
		// Mode: {
		// 	Replicated: {
		// 		Replicas: 1,
		// 	},
		// },
		// EndpointSpec: {
		// 	Ports: [
		// 		{
		// 			TargetPort: server.defaultPortMetrics,
		// 			PublishedPort: server.defaultPortMetrics,
		// 			PublishMode: "host",
		// 		},
		// 	],
		// },
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
			// If container exists, remove it
			await container.remove({ force: true });
			console.log("Removed existing container");
		} catch (error) {
			// Container doesn't exist, continue
		}

		// Create and start new container
		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Monitoring Started ");
	} catch (error) {
		// await docker.createService(settings);
		console.log("Monitoring Not Found: Starting ");
	}
};
