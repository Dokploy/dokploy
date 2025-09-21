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
	{
		mounts: true;
		environment: { with: { project: true } };
		bottomlessReplicationDestination: true;
	}
>;
export const buildLibsql = async (libsql: LibsqlNested) => {
	const {
		appName,
		env,
		externalPort,
		externalGRPCPort,
		externalAdminPort,
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
		enableNamespaces,
		enableBottomlessReplication,
		bottomlessReplicationDestination,
	} = libsql;

	const basicAuth = Buffer.from(
		`${databaseUser}:${databasePassword}`,
		"utf-8",
	).toString("base64");

	let defaultLibsqlEnv = `SQLD_NODE="${sqldNode}"\nSQLD_HTTP_AUTH="basic:${basicAuth}"${
		env ? `\n${env}` : ""
	}${sqldNode === "replica" ? `\nSQLD_PRIMARY_URL="${sqldPrimaryUrl}"` : ""}`;

	// Add bottomless replication environment variables if destination is configured
	if (enableBottomlessReplication && bottomlessReplicationDestination) {
		defaultLibsqlEnv += `\nLIBSQL_BOTTOMLESS_DATABASE_ID="${appName}"`;
		defaultLibsqlEnv += `\nLIBSQL_BOTTOMLESS_BUCKET="${bottomlessReplicationDestination.bucket}"`;
		defaultLibsqlEnv += `\nLIBSQL_BOTTOMLESS_ENDPOINT="${bottomlessReplicationDestination.endpoint}"`;
		defaultLibsqlEnv += `\nLIBSQL_BOTTOMLESS_AWS_SECRET_ACCESS_KEY="${bottomlessReplicationDestination.secretAccessKey}"`;
		defaultLibsqlEnv += `\nLIBSQL_BOTTOMLESS_AWS_ACCESS_KEY_ID="${bottomlessReplicationDestination.accessKey}"`;
		defaultLibsqlEnv += `\nLIBSQL_BOTTOMLESS_AWS_DEFAULT_REGION="${bottomlessReplicationDestination.region}"`;
	}

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

	let finalCommand =
		command ??
		"sqld --db-path iku.db --http-listen-addr 0.0.0.0:8080 --grpc-listen-addr 0.0.0.0:5001 --admin-listen-addr 0.0.0.0:5000";
	if (enableNamespaces) {
		finalCommand += " --enable-namespaces";
	}
	if (enableBottomlessReplication) {
		finalCommand += " --enable-bottomless-replication";
	}

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: "ghcr.io/tursodatabase/libsql-server:latest",
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				...(finalCommand
					? {
							Command: ["/bin/sh"],
							Args: ["-c", finalCommand],
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
				...(externalAdminPort
					? [
							{
								Protocol: "tcp",
								TargetPort: 5000,
								PublishedPort: externalAdminPort,
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
