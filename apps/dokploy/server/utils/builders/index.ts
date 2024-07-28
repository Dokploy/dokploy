import { createWriteStream } from "node:fs";
import { docker } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { uploadImage } from "../cluster/upload";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { buildCustomDocker } from "./docker-file";
import { buildHeroku } from "./heroku";
import { buildNixpacks } from "./nixpacks";
import { buildPaketo } from "./paketo";

// NIXPACKS codeDirectory = where is the path of the code directory
// HEROKU codeDirectory = where is the path of the code directory
// PAKETO codeDirectory = where is the path of the code directory
// DOCKERFILE codeDirectory = where is the exact path of the (Dockerfile)
export type ApplicationNested = InferResultType<
	"applications",
	{ mounts: true; security: true; redirects: true; ports: true; registry: true }
>;
export const buildApplication = async (
	application: ApplicationNested,
	logPath: string,
) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { buildType, sourceType } = application;
	try {
		writeStream.write(
			`\nBuild ${buildType}: ✅\nSource Type: ${sourceType}: ✅\n`,
		);
		console.log(`Build ${buildType}: ✅`);
		if (buildType === "nixpacks") {
			await buildNixpacks(application, writeStream);
		} else if (buildType === "heroku_buildpacks") {
			await buildHeroku(application, writeStream);
		} else if (buildType === "paketo_buildpacks") {
			await buildPaketo(application, writeStream);
		} else if (buildType === "dockerfile") {
			await buildCustomDocker(application, writeStream);
		}

		if (application.registryId) {
			await uploadImage(application, writeStream);
		}
		await mechanizeDockerContainer(application);
		writeStream.write("Docker Deployed: ✅");
	} catch (error) {
		writeStream.write("Error ❌");
		throw error;
	} finally {
		writeStream.end();
	}
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
	} = generateConfigContainer(application);

	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, mounts);
	const envVariables = prepareEnvironmentVariables(env);

	const image = getImageName(application);
	const authConfig = getAuthConfig(application);

	const settings: CreateServiceOptions = {
		authconfig: authConfig,
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: image,
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
			Ports: ports.map((port) => ({
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
		await docker.createService(settings);
	}
};

const getImageName = (application: ApplicationNested) => {
	const { appName, sourceType, dockerImage, registry } = application;

	if (sourceType === "docker") {
		return dockerImage || "ERROR-NO-IMAGE-PROVIDED";
	}

	const registryUrl = registry?.registryUrl || "";
	const imagePrefix = registry?.imagePrefix ? `${registry.imagePrefix}/` : "";
	return registry
		? `${registryUrl}/${imagePrefix}${appName}`
		: `${appName}:latest`;
};

const getAuthConfig = (application: ApplicationNested) => {
	const { registry, username, password, sourceType } = application;

	if (sourceType === "docker") {
		if (username && password) {
			return {
				password,
				username,
				serveraddress: "https://index.docker.io/v1/",
			};
		}
	} else if (registry) {
		return {
			password: registry.password,
			username: registry.username,
			serveraddress: registry.registryUrl,
		};
	}

	return undefined;
};
