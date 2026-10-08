import {
	createRegistry,
	findAllRegistryByOrganizationId,
	findRegistryById,
	IS_CLOUD,
	listECRRepositories as listECRRepos,
	listECRImageTags as listECRTags,
	loginDockerToECR,
	removeRegistry,
	runDockerLogin,
	updateRegistry,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertServerInOrganization } from "@/server/api/utils/server-org-scope";
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
	all: withPermission("registry", "read").query(async ({ ctx }) => {
		return await findAllRegistryByOrganizationId(
			ctx.session.activeOrganizationId,
		);
	}),
	one: withPermission("registry", "read")
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
		.input(apiTestRegistry)
		.mutation(async ({ input, ctx }) => {
			// `docker login` runs over SSH on `input.serverId`; the guard stays
			// outside the try/catch below so it is not rewritten to BAD_REQUEST.
			await assertServerInOrganization(
				input.serverId && input.serverId !== "none"
					? input.serverId
					: undefined,
				ctx.session?.activeOrganizationId,
			);
			try {
				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Select a server to test the registry",
					});
				}

				if (input.registryType === "awsEcr") {
					await loginDockerToECR(
						{
							awsAccessKeyId: input.awsAccessKeyId || "",
							awsSecretAccessKey: input.awsSecretAccessKey || "",
							awsRegion: input.awsRegion || "",
							registryUrl: input.registryUrl,
						},
						input.serverId,
					);
					return true;
				}

				await runDockerLogin(
					{
						registryType: input.registryType ?? "cloud",
						registryUrl: input.registryUrl,
						username: input.username,
						password: input.password,
					},
					input.serverId && input.serverId !== "none"
						? input.serverId
						: undefined,
				);

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
		.input(apiTestRegistryById)
		.mutation(async ({ input, ctx }) => {
			// Both the registry row and the target server are caller-supplied and
			// end up in a `docker login` over SSH, so authorize them before the
			// try/catch below, which would otherwise rewrite UNAUTHORIZED into
			// BAD_REQUEST.
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

			await assertServerInOrganization(
				input.serverId && input.serverId !== "none"
					? input.serverId
					: undefined,
				ctx.session?.activeOrganizationId,
			);

			try {
				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Select a server to test the registry",
					});
				}

				if (registryData.registryType === "awsEcr") {
					await loginDockerToECR(
						{
							awsAccessKeyId: registryData.awsAccessKeyId || "",
							awsSecretAccessKey: registryData.awsSecretAccessKey || "",
							awsRegion: registryData.awsRegion || "",
							registryUrl: registryData.registryUrl,
						},
						input.serverId,
					);
				} else {
					await runDockerLogin(
						{
							registryType: registryData.registryType,
							registryUrl: registryData.registryUrl,
							username: registryData.username,
							password: registryData.password,
						},
						input.serverId && input.serverId !== "none"
							? input.serverId
							: undefined,
					);
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
	listECRImageTags: withPermission("registry", "read")
		.input(
			z.object({
				registryId: z.string().min(1),
				repositoryName: z.string().min(1),
			}),
		)
		.query(async ({ input, ctx }) => {
			const registryData = await db.query.registry.findFirst({
				where: eq(registry.registryId, input.registryId),
			});

			if (!registryData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Registry not found",
				});
			}

			if (registryData.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED", message: "Access denied" });
			}

			if (registryData.registryType !== "awsEcr") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Registry is not an ECR registry",
				});
			}

			try {
				return await listECRTags(
					{
						awsAccessKeyId: registryData.awsAccessKeyId || "",
						awsSecretAccessKey: registryData.awsSecretAccessKey || "",
						awsRegion: registryData.awsRegion || "",
					},
					input.repositoryName,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to list image tags",
					cause: error,
				});
			}
		}),
	listECRRepositories: withPermission("registry", "read")
		.input(z.object({ registryId: z.string().min(1) }))
		.query(async ({ input, ctx }) => {
			const registryData = await db.query.registry.findFirst({
				where: eq(registry.registryId, input.registryId),
			});

			if (!registryData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Registry not found",
				});
			}

			if (registryData.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED", message: "Access denied" });
			}

			if (registryData.registryType !== "awsEcr") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Registry is not an ECR registry",
				});
			}

			try {
				return await listECRRepos({
					awsAccessKeyId: registryData.awsAccessKeyId || "",
					awsSecretAccessKey: registryData.awsSecretAccessKey || "",
					awsRegion: registryData.awsRegion || "",
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to list ECR repositories",
					cause: error,
				});
			}
		}),
});
