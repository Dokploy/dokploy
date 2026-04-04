import {
	createRegistry,
	execAsyncRemote,
	execFileAsync,
	findAllRegistryByOrganizationId,
	findRegistryById,
	IS_CLOUD,
	listECRRepositories as listECRRepos,
	listECRImageTags as listECRTags,
	loginDockerToECR,
	removeRegistry,
	updateRegistry,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
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
		.mutation(async ({ input }) => {
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

				const args = [
					"login",
					input.registryUrl,
					"--username",
					input.username || "",
					"--password-stdin",
				];

				if (input.serverId && input.serverId !== "none") {
					await execAsyncRemote(
						input.serverId,
						`echo ${input.password} | docker ${args.join(" ")}`,
					);
				} else {
					await execFileAsync("docker", args, {
						input: Buffer.from(input.password || "").toString(),
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
					const args = [
						"login",
						registryData.registryUrl,
						"--username",
						registryData.username,
						"--password-stdin",
					];

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
