import { eq } from "drizzle-orm";
import { db } from "../db";
import { type createRollbackSchema, rollbacks } from "../db/schema";
import type { z } from "zod";
import { findApplicationById } from "./application";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import type { ApplicationNested } from "../utils/builders";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import type { CreateServiceOptions } from "dockerode";
import { findDeploymentById } from "./deployment";

export const createRollback = async (
	input: z.infer<typeof createRollbackSchema>,
) => {
	await db.transaction(async (tx) => {
		const rollback = await tx
			.insert(rollbacks)
			.values(input)
			.returning()
			.then((res) => res[0]);

		if (!rollback) {
			throw new Error("Failed to create rollback");
		}

		const tagImage = `${input.appName}:v${rollback.version}`;

		await tx
			.update(rollbacks)
			.set({
				image: tagImage,
			})
			.where(eq(rollbacks.rollbackId, rollback.rollbackId));

		const deployment = await findDeploymentById(rollback.deploymentId);

		if (!deployment?.applicationId) {
			throw new Error("Deployment not found");
		}

		const application = await findApplicationById(deployment.applicationId);

		await createRollbackImage(application, tagImage);

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

	const result = docker.getImage(`${application.appName}:latest`);

	const version = tagImage.split(":")[1];

	await result.tag({
		repo: tagImage,
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
	const result = await db
		.delete(rollbacks)
		.where(eq(rollbacks.rollbackId, rollbackId))
		.returning()
		.then((res) => res[0]);

	if (result?.image) {
		try {
			const deployment = await findDeploymentById(result.deploymentId);

			if (!deployment?.applicationId) {
				throw new Error("Deployment not found");
			}

			const application = await findApplicationById(deployment.applicationId);
			await deleteRollbackImage(result.image, application.serverId);
		} catch (error) {
			console.error(error);
		}
	}

	return result;
};

export const rollback = async (rollbackId: string) => {
	const result = await findRollbackById(rollbackId);

	const deployment = await findDeploymentById(result.deploymentId);

	if (!deployment?.applicationId) {
		throw new Error("Deployment not found");
	}

	const application = await findApplicationById(deployment.applicationId);

	await rollbackApplication(
		application.appName,
		result.image || "",
		result.env || "",
		application.serverId,
	);
};

const rollbackApplication = async (
	appName: string,
	image: string,
	env: string,
	serverId?: string | null,
) => {
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: image,
				// Env: env.split("\n"),
			},
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
	} catch (_error: unknown) {
		await docker.createService(settings);
	}
};
