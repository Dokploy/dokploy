import type { Mongo } from "@/server/api/services/mongo";
import type { Mount } from "@/server/api/services/mount";
import type { Postgres } from "@/server/api/services/postgres";
import { docker } from "@/server/constants";
import type { CreateServiceOptions } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";

type MongoWithMounts = Mongo & {
	mounts: Mount[];
};

export const buildMongo = async (mongo: MongoWithMounts) => {
	const {
		appName,
		env,
		externalPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
		databaseUser,
		databasePassword,
		command,
		mounts,
	} = mongo;

	const defaultMongoEnv = `MONGO_INITDB_ROOT_USERNAME=${databaseUser}\nMONGO_INITDB_ROOT_PASSWORD=${databasePassword}${
		env ? `\n${env}` : ""
	}`;
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(defaultMongoEnv);
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
				...(command
					? {
							Command: ["/bin/sh"],
							Args: ["-c", command],
						}
					: {}),
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
							TargetPort: 27017,
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
