import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { resolveServiceNetworks } from "../../services/network";
import { buildDokployLabels } from "../docker/dokploy-labels";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";
import { withResolvedVaultRefs } from "../vault";

import {
	type GenerateMongoStartupScriptOptions,
	generateMongoStartupScript,
} from "./mongo-script";

export type MongoNested = InferResultType<
	"mongo",
	{ mounts: true; environment: { with: { project: true } } }
>;

export { type GenerateMongoStartupScriptOptions, generateMongoStartupScript };

export const buildMongo = async (rawMongo: MongoNested) => {
	const mongo = await withResolvedVaultRefs(rawMongo);
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
		args,
		mounts,
		replicaSets,
	} = mongo;

	const startupScript = generateMongoStartupScript({
		appName,
		databaseUser,
		databasePassword,
		command,
		replicaSets,
	});

	const defaultMongoEnv = `MONGO_INITDB_ROOT_USERNAME="${databaseUser}"\nMONGO_INITDB_ROOT_PASSWORD="${databasePassword}"${replicaSets ? "\nMONGO_INITDB_DATABASE=admin" : ""}${
		env ? `\n${env}` : ""
	}`;

	const resolvedNetworks = await resolveServiceNetworks(mongo);

	const {
		HealthCheck,
		RestartPolicy,
		Placement,
		Labels,
		Mode,
		RollbackConfig,
		UpdateConfig,
		StopGracePeriod,
		EndpointSpec,
		Ulimits,
	} = generateConfigContainer(mongo);

	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});

	const envVariables = prepareEnvironmentVariables(
		defaultMongoEnv,
		mongo.environment.project.env,
		mongo.environment.env,
	);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, mongo);

	const docker = await getRemoteDocker(mongo.serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: dockerImage,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				...(StopGracePeriod !== null &&
					StopGracePeriod !== undefined && { StopGracePeriod }),
				...(replicaSets
					? {
							Command: ["/bin/bash"],
							Args: ["-c", startupScript],
						}
					: {}),
				...(command &&
					!replicaSets && {
						Command: command.split(" "),
					}),
				...(args &&
					args.length > 0 &&
					!replicaSets && {
						Args: args,
					}),
				...(Ulimits && { Ulimits }),
				Labels: {
					...Labels,
					...buildDokployLabels({
						organizationId: mongo.environment.project.organizationId,
						projectId: mongo.environment.projectId,
						projectName: mongo.environment.project.name,
						environmentId: mongo.environmentId,
						environmentName: mongo.environment.name,
						applicationId: mongo.mongoId,
						applicationName: mongo.name,
					}),
				},
			},
			Networks: resolvedNetworks,
			RestartPolicy,
			Placement,
			Resources: {
				...resources,
			},
		},
		Mode,
		RollbackConfig,
		EndpointSpec: EndpointSpec
			? EndpointSpec
			: {
					Mode: "dnsrr" as const,
					Ports: externalPort
						? [
								{
									Protocol: "tcp" as const,
									TargetPort: 27017,
									PublishedPort: externalPort,
									PublishMode: "host" as const,
								},
							]
						: [],
				},
		UpdateConfig: mongo.updateConfigSwarm ?? {
			Parallelism: 1,
			Order: "stop-first" as const,
			FailureAction: "rollback" as const,
		},
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
