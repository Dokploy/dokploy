import { resolveServiceNetworks } from "@dokploy/server/services/network";
import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { getRegistryTag, uploadImageRemoteCommand } from "../cluster/upload";
import { buildDokployLabels } from "../docker/dokploy-labels";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { sleep } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";
import { withResolvedVaultRefs } from "../vault";
import { getDockerCommand } from "./docker-file";
import { getHerokuCommand } from "./heroku";
import { getNixpacksCommand } from "./nixpacks";
import { getPaketoCommand } from "./paketo";
import { getRailpackCommand } from "./railpack";
import { getStaticCommand } from "./static";

// NIXPACKS codeDirectory = where is the path of the code directory
// HEROKU codeDirectory = where is the path of the code directory
// PAKETO codeDirectory = where is the path of the code directory
// DOCKERFILE codeDirectory = where is the exact path of the (Dockerfile)
export type ApplicationNested = InferResultType<
	"applications",
	{
		mounts: true;
		security: true;
		redirects: true;
		ports: true;
		registry: { columns: { password: false } };
		buildRegistry: { columns: { password: false } };
		rollbackRegistry: { columns: { password: false } };
		deployments: true;
		environment: { with: { project: true } };
	}
>;

export const getBuildCommand = async (rawApplication: ApplicationNested) => {
	const application = await withResolvedVaultRefs(rawApplication);
	let command = "";

	if (application.sourceType !== "docker") {
		const { buildType } = application;
		switch (buildType) {
			case "nixpacks":
				command = getNixpacksCommand(application);
				break;
			case "heroku_buildpacks":
				command = getHerokuCommand(application);
				break;
			case "paketo_buildpacks":
				command = getPaketoCommand(application);
				break;
			case "static":
				command = getStaticCommand(application);
				break;
			case "dockerfile":
				command = getDockerCommand(application);
				break;
			case "railpack":
				command = getRailpackCommand(application);
				break;
		}
	}

	if (
		application.registry ||
		application.buildRegistry ||
		application.rollbackRegistry
	) {
		command += await uploadImageRemoteCommand(application);
	}

	return command;
};

export const mechanizeDockerContainer = async (
	rawApplication: ApplicationNested,
) => {
	const application = await withResolvedVaultRefs(rawApplication);
	const {
		appName,
		env,
		mounts,
		cpuLimit,
		memoryLimit,
		memoryReservation,
		cpuReservation,
		command,
		args,
		ports,
	} = application;

	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});

	const volumesMount = generateVolumeMounts(mounts);

	const resolvedNetworks = await resolveServiceNetworks(application);

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
	} = generateConfigContainer(application);

	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.environment.project.env,
		application.environment.env,
	);

	const image = await getImageName(application);
	const authConfig = await getAuthConfig(application);
	const docker = await getRemoteDocker(application.serverId);

	const settings: CreateServiceOptions = {
		authconfig: authConfig,
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: image,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				...(StopGracePeriod !== null &&
					StopGracePeriod !== undefined && { StopGracePeriod }),
				...(command && {
					Command: command.split(" "),
				}),
				...(args &&
					args.length > 0 && {
						Args: args,
					}),
				...(Ulimits && { Ulimits }),
				Labels: {
					...Labels,
					...buildDokployLabels({
						organizationId: application.environment.project.organizationId,
						projectId: application.environment.projectId,
						projectName: application.environment.project.name,
						environmentId: application.environmentId,
						environmentName: application.environment.name,
						applicationId: application.applicationId,
						applicationName: application.name,
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
					Ports: ports.map((port) => ({
						PublishMode: port.publishMode,
						Protocol: port.protocol,
						TargetPort: port.targetPort,
						PublishedPort: port.publishedPort,
					})),
				},
		UpdateConfig,
	};

	let forceUpdate = 0;
	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		forceUpdate = inspect.Spec.TaskTemplate.ForceUpdate + 1;

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			// Dokploy sets no service-level labels of its own. A service update
			// replaces the whole spec, so labels added outside Dokploy (e.g.
			// traefik.* for the Swarm provider) are dropped unless carried over.
			Labels: inspect.Spec?.Labels ?? {},
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: forceUpdate,
			},
		});
	} catch (error) {
		console.log(error);
		if (authConfig) {
			await docker.createService(authConfig, settings);
		} else {
			await docker.createService(settings);
		}
	}

	// Swarm only reports a task it can't place (e.g. insufficient resources) on the task itself.
	const deadline = Date.now() + 3000;
	while (Date.now() < deadline) {
		const tasks = await docker.listTasks({
			filters: JSON.stringify({
				service: [appName],
				"desired-state": ["running"],
			}),
		});
		const newTasks = tasks.filter(
			(task) => (task.Spec?.ForceUpdate ?? 0) === forceUpdate,
		);
		const unscheduled = newTasks.find(
			(task) => task.Status?.State === "pending" && task.Status?.Err,
		);
		if (unscheduled) {
			throw new Error(
				`Swarm could not start the new version: ${unscheduled.Status.Err}. Lower the memory/CPU reservation or free resources on the server.`,
			);
		}
		const scheduled =
			newTasks.length > 0 &&
			newTasks.every(
				(task) => !["new", "allocated", "pending"].includes(task.Status?.State),
			);
		if (scheduled) return;
		await sleep(300);
	}
};

const getImageName = async (application: ApplicationNested) => {
	const { appName, sourceType, dockerImage, registry, buildRegistry } =
		application;
	const imageName = `${appName}:latest`;
	if (sourceType === "docker") {
		return dockerImage || "ERROR-NO-IMAGE-PROVIDED";
	}

	if (registry) {
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		return getRegistryTag(r, imageName);
	}
	if (buildRegistry) {
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		return getRegistryTag(r, imageName);
	}

	return imageName;
};

export const getAuthConfig = async (application: ApplicationNested) => {
	const {
		registry,
		buildRegistry,
		username,
		password,
		sourceType,
		registryUrl,
	} = application;

	if (sourceType === "docker") {
		if (username && password) {
			return { password, username, serveraddress: registryUrl || "" };
		}
	} else if (registry) {
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	} else if (buildRegistry) {
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	}

	return undefined;
};
