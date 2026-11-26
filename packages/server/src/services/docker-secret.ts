import { TRPCError } from "@trpc/server";
import type Dockerode from "dockerode";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const SWARM_SECRET_MAX_BYTES = 500 * 1024 - 1;

export interface SwarmSecretService {
	id: string;
	name: string;
	stack: string | null;
	current: boolean;
	rollback: boolean;
}

export interface SwarmSecret {
	id: string;
	name: string;
	createdAt: string | null;
	services: SwarmSecretService[];
}

// Return only metadata. Docker service specs can contain unrelated credentials.
export const getSecretReferences = (
	secretId: string,
	services: Pick<Dockerode.Service, "ID" | "Spec" | "PreviousSpec">[],
): SwarmSecretService[] =>
	services
		.flatMap((service) => {
			const uses = (spec: Dockerode.ServiceSpec | undefined) => {
				const task = spec?.TaskTemplate;
				return task && "ContainerSpec" in task
					? (task.ContainerSpec?.Secrets?.some(
							(secret) => secret.SecretID === secretId,
						) ?? false)
					: false;
			};
			const current = uses(service.Spec);
			const rollback = uses(service.PreviousSpec);
			return current || rollback
				? [
						{
							id: service.ID,
							name: service.Spec?.Name || service.ID,
							stack:
								service.Spec?.Labels?.["com.docker.stack.namespace"] || null,
							current,
							rollback,
						},
					]
				: [];
		})
		.sort((a, b) => a.name.localeCompare(b.name));

const secretError = (error: unknown): never => {
	if (error instanceof TRPCError) throw error;
	const statusCode = (error as { statusCode?: number })?.statusCode;
	if (statusCode === 409) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"The secret already exists or is still in use. Refresh the list and try again.",
		});
	}
	if (statusCode === 404) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "The secret no longer exists. Refresh the list.",
		});
	}
	// Never attach the Docker error: create errors may contain the request data.
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message:
			"Could not manage Swarm secrets. Check the server connection and Docker permissions.",
	});
};

export const getSwarmSecretManager = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);
	const info = await docker.info();
	if (info.Swarm?.LocalNodeState !== "active") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This server is not in an active Docker Swarm.",
		});
	}
	if (!info.Swarm.ControlAvailable) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Select a Swarm manager to manage secrets. This server is a worker.",
		});
	}
	return docker;
};

export const countSwarmSecrets = async (serverId?: string) => {
	try {
		const docker = await getSwarmSecretManager(serverId);
		return { total: (await docker.listSecrets()).length };
	} catch (error) {
		return secretError(error);
	}
};

export const listSwarmSecrets = async (
	serverId?: string,
): Promise<SwarmSecret[]> => {
	try {
		const docker = await getSwarmSecretManager(serverId);
		const [secrets, services] = await Promise.all([
			docker.listSecrets(),
			docker.listServices(),
		]);
		return secrets
			.map((secret) => ({
				id: secret.ID,
				name: secret.Spec?.Name || secret.ID,
				createdAt: secret.CreatedAt ?? null,
				services: getSecretReferences(secret.ID, services),
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch (error) {
		return secretError(error);
	}
};

export const createSwarmSecret = async (
	name: string,
	value: string,
	serverId?: string,
) => {
	try {
		const docker = await getSwarmSecretManager(serverId);
		const secret = await docker.createSecret({
			Name: name,
			Data: Buffer.from(value, "utf8").toString("base64"),
		});
		return { id: secret.id };
	} catch (error) {
		return secretError(error);
	}
};

export const removeSwarmSecret = async (
	secretId: string,
	confirmationName: string,
	serverId?: string,
) => {
	try {
		const docker = await getSwarmSecretManager(serverId);
		const secret = docker.getSecret(secretId);
		if ((await secret.inspect()).Spec?.Name !== confirmationName) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The confirmation name does not match this secret.",
			});
		}
		const references = getSecretReferences(
			secretId,
			await docker.listServices(),
		);
		if (references.length) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"This secret is referenced by a service or its rollback specification. Remove those references before deleting it.",
			});
		}
		// Docker also checks usage atomically, covering a concurrent service update.
		await secret.remove();
	} catch (error) {
		secretError(error);
	}
};
