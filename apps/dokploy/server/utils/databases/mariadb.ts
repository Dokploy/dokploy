import type { Mariadb } from "@/server/api/services/mariadb";
import type { Mount } from "@/server/api/services/mount";
import type { CreateServiceOptions } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";

type MariadbWithMounts = Mariadb & {
	mounts: Mount[];
};
export const buildMariadb = async (mariadb: MariadbWithMounts) => {
	const {
		appName,
		env,
		externalPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		databaseName,
		databaseUser,
		databasePassword,
		databaseRootPassword,
		cpuLimit,
		cpuReservation,
		command,
		mounts,
	} = mariadb;

	const defaultMariadbEnv = `MARIADB_DATABASE=${databaseName}\nMARIADB_USER=${databaseUser}\nMARIADB_PASSWORD=${databasePassword}\nMARIADB_ROOT_PASSWORD=${databaseRootPassword}${
		env ? `\n${env}` : ""
	}`;
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(defaultMariadbEnv);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, mounts);

	const docker = await getRemoteDocker(mariadb.serverId);

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
							TargetPort: 3306,
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
