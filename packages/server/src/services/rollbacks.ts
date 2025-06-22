import { eq } from "drizzle-orm";
import { db } from "../db";
import {
	type createRollbackSchema,
	rollbacks,
	deployments as deploymentsSchema,
} from "../db/schema";
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
				fullContext: JSON.stringify(rest),
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

	await rollbackApplication(
		application.appName,
		result.image || "",
		application.serverId,
	);
};

const rollbackApplication = async (
	appName: string,
	image: string,
	serverId?: string | null,
) => {
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: image,
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
