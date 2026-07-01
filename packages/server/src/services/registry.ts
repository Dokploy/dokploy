import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { redactSecretFields } from "@dokploy/server/utils/security/redaction";
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

export function sanitizeRegistryError(
	error: unknown,
	password: string | null | undefined,
): string {
	const message =
		error instanceof Error ? error.message : "Error with registry login";
	if (!password) return message;
	const passwordForms = new Set([password, shEscape(password)]);
	let sanitized = message;
	for (const secret of passwordForms) {
		sanitized = sanitized.split(secret).join("***");
	}
	return sanitized;
}

const assertCloudRegistryServer = (serverId?: string | null) => {
	if (IS_CLOUD && (!serverId || serverId === "none")) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Select a server to add the registry",
		});
	}
};

export const createRegistry = async (
	input: z.infer<typeof apiCreateRegistry>,
	organizationId: string,
) => {
	assertCloudRegistryServer(input.serverId);
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

		const loginCommand = safeDockerLoginCommand(
			input.registryUrl,
			input.username,
			input.password,
		);
		try {
			if (input.serverId && input.serverId !== "none") {
				await execAsyncRemote(input.serverId, loginCommand);
			} else if (newRegistry.registryType === "cloud") {
				await execAsync(loginCommand);
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
		const rows = await db
			.delete(registry)
			.where(eq(registry.registryId, registryId))
			.returning();
		const response = rows[0];

		if (!response) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Registry not found",
			});
		}

		if (!IS_CLOUD) {
			await execAsync(`docker logout ${shEscape(response.registryUrl)}`);
		}

		return redactSecretFields(response, ["password"]);
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
		assertCloudRegistryServer(registryData.serverId);
		const rows = await db
			.update(registry)
			.set({
				...registryData,
			})
			.where(eq(registry.registryId, registryId))
			.returning();
		const response = rows[0];

		const loginCommand = safeDockerLoginCommand(
			response?.registryUrl,
			response?.username,
			response?.password,
		);

		try {
			if (registryData?.serverId && registryData?.serverId !== "none") {
				await execAsyncRemote(registryData.serverId, loginCommand);
			} else if (response?.registryType === "cloud") {
				await execAsync(loginCommand);
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
