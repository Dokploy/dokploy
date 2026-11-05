import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
	execFileAsync,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";

export type Registry = typeof registry.$inferSelect;

function shEscape(s: string | undefined): string {
	if (!s) return "''";
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function safeDockerLoginCommand(
	registry: string | undefined,
	user: string | undefined,
	pass: string | undefined,
) {
	const escapedRegistry = shEscape(registry);
	const escapedUser = shEscape(user);
	const escapedPassword = shEscape(pass);
	return `printf %s ${escapedPassword} | docker login ${escapedRegistry} -u ${escapedUser} --password-stdin`;
}

export async function dockerLogin(
	registryUrl: string | undefined,
	username: string | undefined,
	password: string | undefined,
	serverId?: string | null,
): Promise<void> {
	const args = [
		"login",
		registryUrl ?? "",
		"--username",
		username ?? "",
		"--password-stdin",
	];
	try {
		if (serverId && serverId !== "none") {
			const command = `docker login ${shEscape(registryUrl)} --username ${shEscape(username)} --password-stdin`;
			await execAsyncRemote(serverId, command, undefined, password ?? "");
		} else {
			await execFileAsync("docker", args, { input: password ?? "" });
		}
	} catch (error) {
		// Do not retain an execution error that may contain echoed credentials.
		throw new Error(sanitizeRegistryError(error, password));
	}
}

function sanitizeRegistryError(
	error: unknown,
	password: string | null | undefined,
): string {
	const message =
		error instanceof Error ? error.message : "Error with registry login";
	if (!password) return message;
	return message.split(password).join("***");
}

export const createRegistry = async (
	input: z.infer<typeof apiCreateRegistry>,
	organizationId: string,
) => {
	return await db.transaction(async (tx) => {
		const newRegistry = await tx
			.insert(registry)
			.values({
				...input,
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newRegistry) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input:  Inserting registry",
			});
		}

		if (IS_CLOUD && !input.serverId && input.serverId !== "none") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}
		try {
			if (
				(input.serverId && input.serverId !== "none") ||
				newRegistry.registryType === "cloud"
			) {
				await dockerLogin(
					input.registryUrl,
					input.username,
					input.password,
					input.serverId,
				);
			}
		} catch (error) {
			const sanitized = sanitizeRegistryError(error, input.password);
			throw new TRPCError({ code: "BAD_REQUEST", message: sanitized });
		}

		return newRegistry;
	});
};

export const removeRegistry = async (registryId: string) => {
	try {
		const response = await db
			.delete(registry)
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (!response) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Registry not found",
			});
		}

		if (!IS_CLOUD) {
			await execAsync(`docker logout ${shEscape(response.registryUrl)}`);
		}

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error removing this registry",
			cause: error,
		});
	}
};

export const updateRegistry = async (
	registryId: string,
	registryData: Partial<Registry> & { serverId?: string | null },
) => {
	try {
		const response = await db
			.update(registry)
			.set({
				...registryData,
			})
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (
			IS_CLOUD &&
			!registryData?.serverId &&
			registryData?.serverId !== "none"
		) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}

		try {
			if (
				(registryData.serverId && registryData.serverId !== "none") ||
				response?.registryType === "cloud"
			) {
				await dockerLogin(
					response?.registryUrl,
					response?.username,
					response?.password,
					registryData.serverId,
				);
			}
		} catch (execError) {
			throw new Error(sanitizeRegistryError(execError, response?.password));
		}

		return response;
	} catch (error) {
		const message =
			error instanceof TRPCError
				? error.message
				: error instanceof Error
					? error.message
					: "Error updating this registry";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};

export const findRegistryById = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
		columns: {
			password: false,
		},
	});
	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}
	return registryResponse;
};

export const findRegistryByIdWithCredentials = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
	});
	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}
	return registryResponse;
};

export const findAllRegistryByOrganizationId = async (
	organizationId: string,
) => {
	const registryResponse = await db.query.registry.findMany({
		where: eq(registry.organizationId, organizationId),
	});
	return registryResponse;
};
