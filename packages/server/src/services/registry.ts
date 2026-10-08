import { db } from "@dokploy/server/db";
import {
	type apiCreateRegistry,
	type RegistryLoginData,
	registry,
} from "@dokploy/server/db/schema";
import { runDockerLogin } from "@dokploy/server/utils/process/dockerLogin";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";
import { getECRAuthToken } from "../utils/aws/ecr";

export type Registry = typeof registry.$inferSelect;

function shEscape(s: string | undefined): string {
	if (!s) return "''";
	return `'${s.replace(/'/g, `'\\''`)}'`;
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
				username: input.username ?? "",
				password: input.password ?? "",
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
		let ecrAuthPassword: string | undefined;
		if (newRegistry.registryType === "awsEcr") {
			const token = await getECRAuthToken({
				awsAccessKeyId: input.awsAccessKeyId || "",
				awsSecretAccessKey: input.awsSecretAccessKey || "",
				awsRegion: input.awsRegion || "",
			});
			ecrAuthPassword = token.password;
		}
		const login: RegistryLoginData = {
			registryType: newRegistry.registryType,
			registryUrl: input.registryUrl,
			username: input.username,
			password: input.password,
			ecrAuthPassword,
		};
		try {
			if (input.serverId && input.serverId !== "none") {
				await runDockerLogin(login, input.serverId);
			} else if (
				newRegistry.registryType === "cloud" ||
				newRegistry.registryType === "awsEcr"
			) {
				await runDockerLogin(login);
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

		let ecrAuthPassword: string | undefined;
		if (response?.registryType === "awsEcr") {
			const token = await getECRAuthToken({
				awsAccessKeyId: response.awsAccessKeyId || "",
				awsSecretAccessKey: response.awsSecretAccessKey || "",
				awsRegion: response.awsRegion || "",
			});
			ecrAuthPassword = token.password;
		}
		const login: RegistryLoginData = {
			registryType: response?.registryType || "cloud",
			registryUrl: response?.registryUrl || undefined,
			username: response?.username || undefined,
			password: response?.password || undefined,
			ecrAuthPassword,
		};

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
			if (registryData?.serverId && registryData?.serverId !== "none") {
				await runDockerLogin(login, registryData.serverId);
			} else if (
				response?.registryType === "cloud" ||
				response?.registryType === "awsEcr"
			) {
				await runDockerLogin(login);
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

/**
 * Finds a registry by ID, intentionally excluding secrets (password, awsSecretAccessKey).
 * Used for API responses and authorization checks where secrets are not needed.
 * Code that needs secrets (login, deploy) should query the DB directly or
 * use application relations which include all fields.
 */
export const findRegistryById = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
		columns: {
			password: false,
			awsSecretAccessKey: false,
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
		columns: {
			password: false,
			awsSecretAccessKey: false,
		},
	});
	return registryResponse;
};
