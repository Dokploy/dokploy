import {
	createRegistry,
	execAsyncRemote,
	execFileAsync,
	findRegistryById,
	IS_CLOUD,
	removeRegistry,
	updateRegistry,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
	apiCreateRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiTestRegistryById,
	apiUpdateRegistry,
	registry,
} from "@/server/db/schema";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

const shEscape = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

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
				if (input.authType === "credential-helper") {
					const helperName = input.credentialHelper?.trim();
					if (!helperName) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Credential helper name is required",
						});
					}
					const helperCommand = `command -v docker-credential-${shEscape(helperName)}`;

					if (IS_CLOUD && !input.serverId) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Select a server to test the registry",
						});
					}

					if (input.serverId && input.serverId !== "none") {
						await execAsyncRemote(input.serverId, helperCommand);
					} else {
						await execFileAsync("sh", ["-c", helperCommand]);
					}

					return true;
				}

				if (!input.username?.trim() || !input.password?.trim()) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Username and password are required for credential authentication.",
					});
				}

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
						`printf %s ${shEscape(input.password)} | docker ${args.join(" ")}`,
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
	testRegistryById: protectedProcedure
		.input(apiTestRegistryById)
		.mutation(async ({ input, ctx }) => {
			try {
				// Get the full registry with password from database
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

				if (registryData.authType === "credential-helper") {
					const helperName = registryData.credentialHelper?.trim();
					if (!helperName) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Credential helper name is not configured",
						});
					}
					const helperCommand = `command -v docker-credential-${shEscape(helperName)}`;

					if (IS_CLOUD && !input.serverId) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Select a server to test the registry",
						});
					}

					if (input.serverId && input.serverId !== "none") {
						await execAsyncRemote(input.serverId, helperCommand);
					} else {
						await execFileAsync("sh", ["-c", helperCommand]);
					}

					return true;
				}

				if (!registryData.username?.trim() || !registryData.password?.trim()) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Username and password are required for credential authentication.",
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
						`printf %s ${shEscape(registryData.password)} | docker ${args.join(" ")}`,
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
