import type { CreateServiceOptions } from "dockerode";
import { docker } from "../constants";
import { pullImage } from "../utils/docker/utils";
import { getRedisPassword, REDIS_HOST, REDIS_URL } from "./redis-constants";

export const initializeRedis = async () => {
	// Skip provisioning local Redis if an external one is configured
	const normalizedHost = REDIS_HOST?.toLowerCase();
	const isExternalRedis =
		REDIS_URL ||
		(normalizedHost &&
			normalizedHost !== "dokploy-redis" &&
			normalizedHost !== "127.0.0.1" &&
			normalizedHost !== "localhost" &&
			normalizedHost !== "::1");

	if (isExternalRedis) {
		console.log("External Redis detected: Skipping local Redis setup. ✅");
		return;
	}

	const imageName = "redis:7";
	const containerName = "dokploy-redis";

	const redisPassword = getRedisPassword();

	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Mounts: [
					{
						Type: "volume",
						Source: "dokploy-redis",
						Target: "/data",
					},
				],
				...(redisPassword && {
					Args: ["redis-server", "--requirepass", redisPassword],
				}),
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
		...(process.env.NODE_ENV === "development" && {
			EndpointSpec: {
				Ports: [
					{
						TargetPort: 6379,
						PublishedPort: 6379,
						Protocol: "tcp",
						PublishMode: "host",
					},
				],
			},
		}),
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
	} catch (_) {
		try {
			await docker.createService(settings);
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log("Redis service already exists, continuing...");
		}
		console.log("Redis Not Found: Starting ✅");
	}
};
