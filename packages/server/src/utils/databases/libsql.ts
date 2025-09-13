import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions, PortConfig } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";

export type LibsqlNested = InferResultType<
	"libsql",
	{ mounts: true; environment: { with: { project: true } } }
>;
export const buildLibsql = async (libsql: LibsqlNested) => {
	const {
		appName,
		env,
		externalPort,
		externalGRPCPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		databaseUser,
		databasePassword,
		sqldNode,
		sqldPrimaryUrl,
		cpuLimit,
		cpuReservation,
		command,
		mounts,
	} = libsql;

	const basicAuth = Buffer.from(
		`${databaseUser}:${databasePassword}`,
		"utf-8",
	).toString("base64");

	const defaultLibsqlEnv = `SQLD_NODE="${sqldNode}"\nSQLD_HTTP_AUTH="basic:${basicAuth}"${
		env ? `\n${env}` : ""
	}${sqldNode === "replica" ? `\nSQLD_PRIMARY_URL="${sqldPrimaryUrl}"` : ""}`;

	const {
		HealthCheck,
		RestartPolicy,
		Placement,
		Labels,
		Mode,
		RollbackConfig,
		UpdateConfig,
		Networks,
	} = generateConfigContainer(libsql);
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(
		defaultLibsqlEnv,
		libsql.environment.project.env,
		libsql.environment.env,
	);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, libsql);

	const docker = await getRemoteDocker(libsql.serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: dockerImage,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				...(command
					? {
							Command: ["/bin/sh"],
							Args: ["-c", command],
						}
					: {}),
				Labels,
			},
			Networks,
			RestartPolicy,
			Placement,
			Resources: {
				...resources,
			},
		},
		Mode,
		RollbackConfig,
		EndpointSpec: {
			Mode: "dnsrr",
			Ports: [
				...(externalPort
					? [
							{
								Protocol: "tcp",
								TargetPort: 8080,
								PublishedPort: externalPort,
								PublishMode: "host",
							} as PortConfig,
						]
					: []),
				...(externalGRPCPort
					? [
							{
								Protocol: "tcp",
								TargetPort: 5001,
								PublishedPort: externalGRPCPort,
								PublishMode: "host",
							} as PortConfig,
						]
					: []),
			],
		},
		UpdateConfig,
	};
	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
			},
		});
	} catch {
		await docker.createService(settings);
	}
};
