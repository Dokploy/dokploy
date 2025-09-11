import {
	createRegistry,
	execAsyncRemote,
	execFileAsync,
	findRegistryById,
	IS_CLOUD,
	removeRegistry,
	updateRegistry,
	initializeSelfHostedRegistry,
	removeSelfHostedRegistry,
	initializeSimpleRegistry,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
	apiCreateRegistry,
	apiCreateSelfHostedRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiUpdateRegistry,
	registry,
} from "@/server/db/schema";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
export const registryRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateRegistry)
		.mutation(async ({ ctx, input }) => {
			return await createRegistry(input, ctx.session.activeOrganizationId);
		}),
	remove: adminProcedure
		.input(apiRemoveRegistry)
		.mutation(async ({ ctx, input }) => {
			const registry = await findRegistryById(input.registryId);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this registry",
				});
			}
			return await removeRegistry(input.registryId);
		}),
	update: protectedProcedure
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

			return true;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		const registryResponse = await db.query.registry.findMany({
			where: eq(registry.organizationId, ctx.session.activeOrganizationId),
		});
		return registryResponse;
	}),
	one: adminProcedure
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
	testRegistry: protectedProcedure
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
	createSelfHosted: adminProcedure
		.input(apiCreateSelfHostedRegistry)
		.mutation(async ({ input, ctx }) => {
			try {
				// Initialize the self-hosted registry
				const registryConfig = await initializeSelfHostedRegistry({
					username: input.username,
					password: input.password,
					domain: input.domain,
					registryName: input.registryName,
				});

				// Create registry entry in database
				const newRegistry = await createRegistry(
					{
						registryName: registryConfig.registryName,
						username: registryConfig.username,
						password: registryConfig.password,
						registryUrl: registryConfig.registryUrl,
						registryType: "selfHosted",
						imagePrefix: input.domain,
					},
					ctx.session.activeOrganizationId,
				);

				return newRegistry;
			} catch (error) {
				console.error("Self-hosted registry creation error:", error);
				const errorMessage =
					error instanceof Error
						? error.message
						: "Failed to create self-hosted registry";

				// Provide more user-friendly error messages
				if (
					errorMessage.includes("no such host") ||
					errorMessage.includes("dial tcp")
				) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Network error: Unable to pull Docker registry image. Please check your internet connection and try again.",
						cause: error,
					});
				}

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: errorMessage,
					cause: error,
				});
			}
		}),
	removeSelfHosted: adminProcedure
		.input(z.object({ registryId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const registry = await findRegistryById(input.registryId);
				if (registry.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this registry",
					});
				}

				if (registry.registryType !== "selfHosted") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "This is not a self-hosted registry",
					});
				}

				// Remove the Docker service and volumes
				await removeSelfHostedRegistry();

				// Remove from database
				await removeRegistry(input.registryId);

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to remove self-hosted registry",
					cause: error,
				});
			}
		}),
	createSimpleRegistry: adminProcedure
		.input(apiCreateSelfHostedRegistry)
		.mutation(async ({ input, ctx }) => {
			try {
				// Initialize the simple registry
				const registryConfig = await initializeSimpleRegistry({
					username: input.username,
					password: input.password,
					domain: input.domain,
					registryName: input.registryName,
				});

				// Create registry entry in database
				const newRegistry = await createRegistry(
					{
						registryName: registryConfig.registryName,
						username: registryConfig.username,
						password: registryConfig.password,
						registryUrl: registryConfig.registryUrl,
						registryType: "selfHosted",
						imagePrefix: input.domain,
					},
					ctx.session.activeOrganizationId,
				);

				return newRegistry;
			} catch (error) {
				console.error("Simple registry creation error:", error);
				const errorMessage =
					error instanceof Error
						? error.message
						: "Failed to create simple registry";

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: errorMessage,
					cause: error,
				});
			}
		}),

	ensureDefault: adminProcedure.mutation(async ({ ctx }) => {
		try {
			const { ensureDefaultRegistryExists } = await import("@dokploy/server");
			const result = await ensureDefaultRegistryExists(
				ctx.session.activeOrganizationId,
			);

			if (result) {
				await utils.registry.all.invalidate();
				return { success: true, message: "Default registry created" };
			}

			return { success: true, message: "Registry already exists" };
		} catch (error) {
			console.error("Error ensuring default registry:", error);
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Failed to ensure default registry exists",
				cause: error,
			});
		}
	}),
});
