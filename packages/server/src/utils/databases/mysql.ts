import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";

export type MysqlNested = InferResultType<
	"mysql",
	{ mounts: true; project: true }
>;

export const buildMysql = async (mysql: MysqlNested) => {
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
	const envVariables = prepareEnvironmentVariables(
		defaultMysqlEnv,
		mysql.project.env,
	);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, mysql);

	const docker = await getRemoteDocker(mysql.serverId);

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
