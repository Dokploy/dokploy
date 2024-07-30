import type { Mount } from "@/server/api/services/mount";
import type { Redis } from "@/server/api/services/redis";
import { docker } from "@/server/constants";
import type { CreateServiceOptions } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";

type RedisWithMounts = Redis & {
	mounts: Mount[];
};

export const buildRedis = async (redis: RedisWithMounts) => {
	const {
		appName,
		env,
		externalPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		databasePassword,
		cpuLimit,
		cpuReservation,
		command,
		mounts,
	} = redis;

	const defaultRedisEnv = `REDIS_PASSWORD=${databasePassword}${
		env ? `\n${env}` : ""
	}`;
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(defaultRedisEnv);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, mounts);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: dockerImage,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				Command: ["/bin/sh"],
				Args: [
					"-c",
					command ? command : `redis-server --requirepass ${databasePassword}`,
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			Resources: {
				...resources,
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
			Mode: "dnsrr",
			Ports: externalPort
				? [
						{
							Protocol: "tcp",
							TargetPort: 6379,
							PublishedPort: externalPort,
							PublishMode: "host",
						},
					]
				: [],
		},
	};

	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
		});
	} catch (error) {
		await docker.createService(settings);
	}
};
