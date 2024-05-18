import { createWriteStream } from "node:fs";
import { docker } from "@/server/constants";
import type { InferResultType } from "@/server/types/with";
import type { CreateServiceOptions } from "dockerode";
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
import { uploadImage } from "../cluster/upload";

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
		writeStream.write(`ERROR: ${error}: ❌`);
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
		sourceType,
		dockerImage,
		cpuLimit,
		memoryLimit,
		memoryReservation,
		cpuReservation,
		command,
		ports,
		networkSwarm,
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

	const registry = application.registry;

	let image =
		sourceType === "docker"
			? dockerImage || "ERROR-NO-IMAGE-PROVIDED"
			: `${appName}:latest`;

	if (registry) {
		image = `${registry.registryUrl}/${appName}`;

		if (registry.imagePrefix) {
			image = `${registry.registryUrl}/${registry.imagePrefix}/${appName}`;
		}
	}

	const settings: CreateServiceOptions = {
		authconfig: {
			password: registry?.password || "",
			username: registry?.username || "",
			serveraddress: registry?.registryUrl || "",
		},
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
		console.log(error);
		await docker.createService(settings);
	}
};
