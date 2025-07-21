import type { CreateServiceOptions } from "dockerode";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
	type createRollbackSchema,
	deployments as deploymentsSchema,
	rollbacks,
} from "../db/schema";
import { type ApplicationNested, getAuthConfig } from "../utils/builders";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../utils/docker/utils";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import { type Application, findApplicationById } from "./application";
import { findDeploymentById } from "./deployment";
import type { Mount } from "./mount";
import type { Port } from "./port";
import type { Project } from "./project";

export const createRollback = async (
	input: z.infer<typeof createRollbackSchema>,
) => {
	await db.transaction(async (tx) => {
		const { fullContext, ...other } = input;
		const rollback = await tx
			.insert(rollbacks)
			.values(other)
			.returning()
			.then((res) => res[0]);

		if (!rollback) {
			throw new Error("Failed to create rollback");
		}

		const tagImage = `${input.appName}:v${rollback.version}`;
		const deployment = await findDeploymentById(rollback.deploymentId);

		if (!deployment?.applicationId) {
			throw new Error("Deployment not found");
		}

		const {
			deployments: _,
			bitbucket,
			github,
			gitlab,
			gitea,
			...rest
		} = await findApplicationById(deployment.applicationId);

		await tx
			.update(rollbacks)
			.set({
				image: tagImage,
				fullContext: rest,
			})
			.where(eq(rollbacks.rollbackId, rollback.rollbackId));

		// Update the deployment to reference this rollback
		await tx
			.update(deploymentsSchema)
			.set({
				rollbackId: rollback.rollbackId,
			})
			.where(eq(deploymentsSchema.deploymentId, rollback.deploymentId));

		await createRollbackImage(rest, tagImage);

		return rollback;
	});
};

const findRollbackById = async (rollbackId: string) => {
	const result = await db.query.rollbacks.findFirst({
		where: eq(rollbacks.rollbackId, rollbackId),
	});

	if (!result) {
		throw new Error("Rollback not found");
	}

	return result;
};

const createRollbackImage = async (
	application: ApplicationNested,
	tagImage: string,
) => {
	const docker = await getRemoteDocker(application.serverId);

	const appTagName =
		application.sourceType === "docker"
			? application.dockerImage
			: `${application.appName}:latest`;

	const result = docker.getImage(appTagName || "");

	const [repo, version] = tagImage.split(":");

	await result.tag({
		repo,
		tag: version,
	});
};

const deleteRollbackImage = async (image: string, serverId?: string | null) => {
	const command = `docker image rm ${image} --force`;

	if (serverId) {
		await execAsyncRemote(command, serverId);
	} else {
		await execAsync(command);
	}
};

export const removeRollbackById = async (rollbackId: string) => {
	const rollback = await findRollbackById(rollbackId);

	if (!rollback) {
		throw new Error("Rollback not found");
	}

	if (rollback?.image) {
		try {
			const deployment = await findDeploymentById(rollback.deploymentId);

			if (!deployment?.applicationId) {
				throw new Error("Deployment not found");
			}

			const application = await findApplicationById(deployment.applicationId);
			await deleteRollbackImage(rollback.image, application.serverId);

			await db
				.delete(rollbacks)
				.where(eq(rollbacks.rollbackId, rollbackId))
				.returning()
				.then((res) => res[0]);
		} catch (error) {
			console.error(error);
		}
	}

	return rollback;
};

export const rollback = async (rollbackId: string) => {
	const result = await findRollbackById(rollbackId);

	const deployment = await findDeploymentById(result.deploymentId);

	if (!deployment?.applicationId) {
		throw new Error("Deployment not found");
	}

	const application = await findApplicationById(deployment.applicationId);

	if (!result.fullContext) {
		throw new Error("Rollback context not found");
	}

	// Use the full context for rollback
	await rollbackApplication(
		application.appName,
		result.image || "",
		application.serverId,
		result.fullContext,
	);
};

const rollbackApplication = async (
	appName: string,
	image: string,
	serverId?: string | null,
	fullContext?: Application & {
		project: Project;
		mounts: Mount[];
		ports: Port[];
	},
) => {
	if (!fullContext) {
		throw new Error("Full context is required for rollback");
	}

	const docker = await getRemoteDocker(serverId);

	// Use the same configuration as mechanizeDockerContainer
	const {
		env,
		mounts,
		cpuLimit,
		memoryLimit,
		memoryReservation,
		cpuReservation,
		command,
		ports,
	} = fullContext;

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
	} = generateConfigContainer(fullContext as ApplicationNested);

	const bindsMount = generateBindMounts(mounts);
	const envVariables = prepareEnvironmentVariables(
		env,
		fullContext.project.env,
	);

	// For rollback, we use the provided image instead of calculating it
	const authConfig = getAuthConfig(fullContext as ApplicationNested);

	const settings: CreateServiceOptions = {
		authconfig: authConfig,
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: image,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount],
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
	} catch {
		await docker.createService(settings);
	}
};
