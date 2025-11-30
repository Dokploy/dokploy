import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { uploadImageRemoteCommand } from "../cluster/upload";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";
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
		registry: true;
		buildRegistry: true;
		environment: { with: { project: true } };
	}
>;

export const getBuildCommand = (application: ApplicationNested) => {
	let command = "";
	const { buildType } = application;

	if (application.sourceType === "docker") {
		return "";
	}
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
	if (application.registry || application.buildRegistry) {
		command += uploadImageRemoteCommand(application);
	}

	return command;
};

export const mechanizeDockerContainer = async (
	application: ApplicationNested,
) => {
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

	const {
		HealthCheck,
		RestartPolicy,
		Placement,
		Labels,
		Mode,
		RollbackConfig,
		UpdateConfig,
		Networks,
		StopGracePeriod,
		EndpointSpec,
	} = generateConfigContainer(application);

	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.environment.project.env,
		application.environment.env,
	);

	const image = getImageName(application);
	const authConfig = getAuthConfig(application);
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
	} catch (error) {
		console.log(error);
		await docker.createService(settings);
	}
};

const getImageName = (application: ApplicationNested) => {
	const { appName, sourceType, dockerImage, registry, buildRegistry } =
		application;
	const imageName = `${appName}:latest`;
	if (sourceType === "docker") {
		return dockerImage || "ERROR-NO-IMAGE-PROVIDED";
	}

	if (registry) {
		const { registryUrl, imagePrefix, username } = registry;
		const registryTag = imagePrefix
			? `${registryUrl ? `${registryUrl}/` : ""}${imagePrefix}/${imageName}`
			: `${registryUrl ? `${registryUrl}/` : ""}${username}/${imageName}`;
		return registryTag;
	}
	if (buildRegistry) {
		const { registryUrl, imagePrefix, username } = buildRegistry;
		const registryTag = imagePrefix
			? `${registryUrl ? `${registryUrl}/` : ""}${imagePrefix}/${imageName}`
			: `${registryUrl ? `${registryUrl}/` : ""}${username}/${imageName}`;
		return registryTag;
	}

	return imageName;
};

export const getAuthConfig = (application: ApplicationNested) => {
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
			return {
				password,
				username,
				serveraddress: registryUrl || "",
			};
		}
	} else if (registry) {
		return {
			password: registry.password,
			username: registry.username,
			serveraddress: registry.registryUrl,
		};
	} else if (buildRegistry) {
		return {
			password: buildRegistry.password,
			username: buildRegistry.username,
			serveraddress: buildRegistry.registryUrl,
		};
	}

	return undefined;
};
