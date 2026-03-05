import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
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
		const loginCommand = safeDockerLoginCommand(
			input.registryUrl,
			input.username,
			input.password,
		);
		if (input.serverId && input.serverId !== "none") {
			await execAsyncRemote(input.serverId, loginCommand);
		} else if (newRegistry.registryType === "cloud") {
			await execAsync(loginCommand);
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
			await execAsync(`docker logout ${response.registryUrl}`);
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

		const loginCommand = safeDockerLoginCommand(
			response?.registryUrl,
			response?.username,
			response?.password,
		);

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

		if (registryData?.serverId && registryData?.serverId !== "none") {
			await execAsyncRemote(registryData.serverId, loginCommand);
		} else if (response?.registryType === "cloud") {
			await execAsync(loginCommand);
		}

		return response;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error updating this registry";
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

export const findAllRegistryByOrganizationId = async (
	organizationId: string,
) => {
	const registryResponse = await db.query.registry.findMany({
		where: eq(registry.organizationId, organizationId),
	});
	return registryResponse;
};

export const findRegistryByIdWithPassword = async (registryId: string) => {
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

function buildRegistryApiUrl(registryUrl: string): string {
	const trimmed = registryUrl.replace(/\/+$/, "");
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}
	return `http://${trimmed}`;
}

export const fetchRegistryImages = async (
	registryUrl: string,
	username: string,
	password: string,
): Promise<string[]> => {
	const baseUrl = buildRegistryApiUrl(registryUrl);
	const auth = Buffer.from(`${username}:${password}`).toString("base64");

	const response = await fetch(`${baseUrl}/v2/_catalog`, {
		headers: {
			Authorization: `Basic ${auth}`,
		},
	});

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to fetch images from registry: ${response.statusText}`,
		});
	}

	const data = (await response.json()) as { repositories?: string[] };
	return data.repositories ?? [];
};

export const fetchRegistryImageTags = async (
	registryUrl: string,
	username: string,
	password: string,
	imageName: string,
): Promise<string[]> => {
	const baseUrl = buildRegistryApiUrl(registryUrl);
	const auth = Buffer.from(`${username}:${password}`).toString("base64");

	const response = await fetch(`${baseUrl}/v2/${imageName}/tags/list`, {
		headers: {
			Authorization: `Basic ${auth}`,
		},
	});

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to fetch tags for image "${imageName}": ${response.statusText}`,
		});
	}

	const data = (await response.json()) as { tags?: string[] };
	return data.tags ?? [];
};
