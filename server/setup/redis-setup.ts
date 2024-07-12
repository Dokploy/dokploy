import type { CreateServiceOptions } from "dockerode";
import { docker } from "../constants";
import { pullImage } from "../utils/docker/utils";

export const initializeRedis = async () => {
	const imageName = "redis:7";
	const containerName = "dokploy-redis";

	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Mounts: [
					{
						Type: "volume",
						Source: "redis-data-volume",
						Target: "/data",
					},
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			RestartPolicy: {
				Condition: "on-failure",
			},
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
					TargetPort: 6379,
					...(process.env.NODE_ENV === "development"
						? { PublishedPort: 6379 }
						: {}),
					Protocol: "tcp",
				},
			],
		},
	};
	try {
		await pullImage(imageName);

		const service = docker.getService(containerName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
		});
		console.log("Redis Started ✅");
	} catch (error) {
		await docker.createService(settings);
		console.log("Redis Not Found: Starting ✅");
	}
};
