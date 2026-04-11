import {
	createRegistry,
	execAsyncRemote,
	execFileAsync,
	findRegistryById,
	IS_CLOUD,
	removeRegistry,
	updateRegistry,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiTestRegistryById,
	apiUpdateRegistry,
	registry,
} from "@/server/db/schema";
import { createTRPCRouter, withPermission } from "../trpc";
export const registryRouter = createTRPCRouter({
	create: withPermission("registry", "create")
		.meta({
			openapi: {
				summary: "Create registry",
				description: "Creates a new Docker registry entry for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateRegistry)
		.mutation(async ({ ctx, input }) => {
			const reg = await createRegistry(input, ctx.session.activeOrganizationId);
			await audit(ctx, {
				action: "create",
				resourceType: "registry",
				resourceId: reg.registryId,
				resourceName: reg.registryName,
			});
			return reg;
		}),
	remove: withPermission("registry", "delete")
		.meta({
			openapi: {
				summary: "Delete registry",
				description: "Removes a Docker registry entry by ID. Verifies organization ownership and logs an audit event before deletion.",
			},
		})
		.input(apiRemoveRegistry)
		.mutation(async ({ ctx, input }) => {
			const registry = await findRegistryById(input.registryId);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this registry",
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "registry",
				resourceId: registry.registryId,
				resourceName: registry.registryName,
			});
			return await removeRegistry(input.registryId);
		}),
	update: withPermission("registry", "create")
		.meta({
			openapi: {
				summary: "Update registry",
				description: "Updates an existing Docker registry entry. Verifies organization ownership before applying changes and logs an audit event.",
			},
		})
		.input(apiUpdateRegistry)
		.mutation(async ({ input, ctx }) => {
			const { registryId, ...rest } = input;
			const registry = await findRegistryById(registryId);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this registry",
				});
			}
			const application = await updateRegistry(registryId, {
				...rest,
			});

			if (!application) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating registry",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "registry",
				resourceId: registryId,
				resourceName: registry.registryName,
			});
			return true;
		}),
	all: withPermission("registry", "read")
		.meta({
			openapi: {
				summary: "List all registries",
				description: "Returns all Docker registry entries for the current organization.",
			},
		})
		.query(async ({ ctx }) => {
		const registryResponse = await db.query.registry.findMany({
			where: eq(registry.organizationId, ctx.session.activeOrganizationId),
		});
		return registryResponse;
	}),
	one: withPermission("registry", "read")
		.meta({
			openapi: {
				summary: "Get registry",
				description: "Returns a single Docker registry entry by ID. Verifies the caller belongs to the same organization.",
			},
		})
		.input(apiFindOneRegistry)
		.query(async ({ input, ctx }) => {
			const registry = await findRegistryById(input.registryId);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this registry",
				});
			}
			return registry;
		}),
	testRegistry: withPermission("registry", "read")
		.meta({
			openapi: {
				summary: "Test registry credentials",
				description: "Attempts a docker login with the provided credentials to verify the registry URL, username, and password are valid. Can run locally or on a remote server.",
			},
		})
		.input(apiTestRegistry)
		.mutation(async ({ input }) => {
			try {
				const args = [
					"login",
					input.registryUrl,
					"--username",
					input.username,
					"--password-stdin",
				];

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Select a server to test the registry",
					});
				}

				if (input.serverId && input.serverId !== "none") {
					await execAsyncRemote(
						input.serverId,
						`echo ${input.password} | docker ${args.join(" ")}`,
					);
				} else {
					await execFileAsync("docker", args, {
						input: Buffer.from(input.password).toString(),
					});
				}

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error testing the registry",
					cause: error,
				});
			}
		}),
	testRegistryById: withPermission("registry", "read")
		.meta({
			openapi: {
				summary: "Test registry connection by ID",
				description: "Looks up a saved registry by ID and attempts a docker login with its stored credentials. Verifies organization ownership before testing.",
			},
		})
		.input(apiTestRegistryById)
		.mutation(async ({ input, ctx }) => {
			try {
				const registryData = await db.query.registry.findFirst({
					where: eq(registry.registryId, input.registryId ?? ""),
				});

				if (!registryData) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Registry not found",
					});
				}

				if (registryData.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to test this registry",
					});
				}

				const args = [
					"login",
					registryData.registryUrl,
					"--username",
					registryData.username,
					"--password-stdin",
				];

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Select a server to test the registry",
					});
				}

				if (input.serverId && input.serverId !== "none") {
					await execAsyncRemote(
						input.serverId,
						`echo ${registryData.password} | docker ${args.join(" ")}`,
					);
				} else {
					await execFileAsync("docker", args, {
						input: Buffer.from(registryData.password).toString(),
					});
				}

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error testing the registry",
					cause: error,
				});
			}
		}),
});
