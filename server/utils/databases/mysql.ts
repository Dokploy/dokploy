import type { Mount } from "@/server/api/services/mount";
import type { MySql } from "@/server/api/services/mysql";
import { docker } from "@/server/constants";
import type { CreateServiceOptions } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";

type MysqlWithMounts = MySql & {
	mounts: Mount[];
};

export const buildMysql = async (mysql: MysqlWithMounts) => {
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
	} = mysql;

	const defaultMysqlEnv =
		databaseUser !== "root"
			? `MYSQL_USER=${databaseUser}\nMYSQL_DATABASE=${databaseName}\nMYSQL_PASSWORD=${databasePassword}\nMYSQL_ROOT_PASSWORD=${databaseRootPassword}${
					env ? `\n${env}` : ""
				}`
			: `MYSQL_DATABASE=${databaseName}\nMYSQL_ROOT_PASSWORD=${databaseRootPassword}${
					env ? `\n${env}` : ""
				}`;
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(defaultMysqlEnv);
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
