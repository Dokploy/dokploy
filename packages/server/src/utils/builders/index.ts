import { db } from "@dokploy/server/db";
import { applications, domains } from "@dokploy/server/db/schema";
import { resolveServiceNetworks } from "@dokploy/server/services/network";
import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { eq } from "drizzle-orm";
import { getECRAuthToken } from "../aws/ecr";
import { getRegistryTag, uploadImageRemoteCommand } from "../cluster/upload";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	getPredefinedEnvVariables,
	mergePredefinedEnvVariables,
	prepareEnvironmentVariables,
} from "../docker/utils";
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
> & {
	/**
	 * Fork field (build-policy): when an enforced remote build published an
	 * image, the deploy is pinned to `<repository>@sha256:…` instead of the
	 * mutable tag. Set by `prepareBuildPolicyDeploy`, read by `getImageName`.
	 * See services/build-policy/README.md.
	 */
	buildPolicyImage?: string | null;
};

export const getBuildCommand = async (
	rawApplication: ApplicationNested,
	serverId: string | null | undefined,
) => {
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
		command += await uploadImageRemoteCommand(application, serverId);
	}

	return command;
};

/**
 * Builds a map of `serviceName -> public URL` for every other application in the
 * same environment that has a domain, so env vars can reference a sibling's URL
 * via `${{service.<name>.fqdn}}`. Skips the DB query entirely when the env has no
 * such reference. When a service has multiple domains, its first domain is used.
 */
export const buildServiceFqdnMap = async (
	application: ApplicationNested,
): Promise<Record<string, string>> => {
	if (!application.env?.includes("${{service.")) {
		return {};
	}
	const siblings = await db.query.applications.findMany({
		where: eq(applications.environmentId, application.environmentId),
		with: { domains: true },
	});
	const map: Record<string, string> = {};
	for (const sibling of siblings) {
		const domain = sibling.domains?.[0];
		if (domain?.host) {
			map[sibling.name] = `${domain.https ? "https" : "http"}://${domain.host}`;
		}
	}
	return map;
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

	// Inject Dokploy-provided predefined variables (DOKPLOY_FQDN, DOKPLOY_URL,
	// ...) derived from the app's primary domain and identity. When an app has
	// multiple domains the first is used as its primary. Implements
	// Dokploy/dokploy#3829 (backend-only, no schema change).
	const applicationDomains = await db.query.domains.findMany({
		where: eq(domains.applicationId, application.applicationId),
	});
	const predefinedEnv = getPredefinedEnvVariables(
		application,
		applicationDomains[0] ?? null,
	);
	const serviceFqdns = await buildServiceFqdnMap(application);
	const envVariables = prepareEnvironmentVariables(
		mergePredefinedEnvVariables(predefinedEnv, env),
		application.environment.project.env,
		application.environment.env,
		serviceFqdns,
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
				Labels,
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
		if (authConfig) {
			await docker.createService(authConfig, settings);
		} else {
			await docker.createService(settings);
		}
	}
};

const getImageName = async (application: ApplicationNested) => {
	// >>> build-policy hook: deploy by digest.
	// See packages/server/src/services/build-policy/README.md
	if (application.buildPolicyImage) return application.buildPolicyImage;
	// <<< build-policy hook
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
		if (registry) {
			if (registry.registryType === "awsEcr") {
				const token = await getECRAuthToken({
					awsAccessKeyId: registry.awsAccessKeyId || "",
					awsSecretAccessKey: registry.awsSecretAccessKey || "",
					awsRegion: registry.awsRegion || "",
				});
				return {
					password: token.password,
					username: "AWS",
					serveraddress: registry.registryUrl || "",
				};
			}
			const r = await findRegistryByIdWithCredentials(registry.registryId);
			return {
				password: r.password,
				username: r.username,
				serveraddress: r.registryUrl,
			};
		}
		if (username && password) {
			return { password, username, serveraddress: registryUrl || "" };
		}
	} else if (registry) {
		if (registry.registryType === "awsEcr") {
			const token = await getECRAuthToken({
				awsAccessKeyId: registry.awsAccessKeyId || "",
				awsSecretAccessKey: registry.awsSecretAccessKey || "",
				awsRegion: registry.awsRegion || "",
			});
			return {
				password: token.password,
				username: "AWS",
				serveraddress: registry.registryUrl || "",
			};
		}
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	} else if (buildRegistry) {
		if (buildRegistry.registryType === "awsEcr") {
			const token = await getECRAuthToken({
				awsAccessKeyId: buildRegistry.awsAccessKeyId || "",
				awsSecretAccessKey: buildRegistry.awsSecretAccessKey || "",
				awsRegion: buildRegistry.awsRegion || "",
			});
			return {
				password: token.password,
				username: "AWS",
				serveraddress: buildRegistry.registryUrl || "",
			};
		}
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	}

	return undefined;
};
