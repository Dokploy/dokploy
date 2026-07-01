import {
	createRegistry,
	execAsyncRemote,
	execFileAsync,
	findRegistryById,
	getAccessibleServerIds,
	IS_CLOUD,
	removeRegistry,
	safeDockerLoginCommand,
	updateRegistry,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { checkPermission } from "@dokploy/server/services/permission";
import {
	isRedactedSecretValue,
	redactSecretFields,
	redactSecretFieldsList,
} from "@dokploy/server/utils/security/redaction";
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

const assertRegistryServerAccess = async (
	ctx: {
		session: {
			userId: string;
			activeOrganizationId: string;
		};
	},
	serverId?: string,
) => {
	if (!serverId || serverId === "none") {
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

const assertCloudRegistryTestServer = (serverId?: string) => {
	if (IS_CLOUD && (!serverId || serverId === "none")) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Select a server to test the registry",
		});
	}
};

const isRemoteRegistryTestServer = (serverId?: string) =>
	Boolean(serverId && serverId !== "none");

const assertStoredRegistryRemoteTestAccess = async (
	ctx: {
		user: { id: string };
		session: {
			userId: string;
			activeOrganizationId: string;
		};
	},
	serverId?: string,
) => {
	assertCloudRegistryTestServer(serverId);
	await assertRegistryServerAccess(ctx, serverId);

	if (isRemoteRegistryTestServer(serverId)) {
		await checkPermission(ctx, { server: ["execute"] });
	}
};

const sanitizeRegistryTestError = (
	error: unknown,
	password: string | null | undefined,
) => {
	const message =
		error instanceof Error ? error.message : "Error testing the registry";
	if (!password) {
		return message;
	}
	return message.split(password).join("***");
};

export const registryRouter = createTRPCRouter({
	create: withPermission("registry", "create")
		.input(apiCreateRegistry)
		.mutation(async ({ ctx, input }) => {
			assertCloudRegistryTestServer(input.serverId);
			await assertRegistryServerAccess(ctx, input.serverId);
			const reg = await createRegistry(input, ctx.session.activeOrganizationId);
			await audit(ctx, {
				action: "create",
				resourceType: "registry",
				resourceId: reg.registryId,
				resourceName: reg.registryName,
			});
			return redactSecretFields(reg, ["password"]);
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
			return redactSecretFields(await removeRegistry(input.registryId), [
				"password",
			]);
		}),
	update: withPermission("registry", "update")
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
			assertCloudRegistryTestServer(rest.serverId);
			await assertRegistryServerAccess(ctx, rest.serverId);
			const updateData = { ...rest };
			if (isRedactedSecretValue(updateData.password)) {
				delete updateData.password;
			}
			const application = await updateRegistry(registryId, {
				...updateData,
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
		const registryResponse = await db.query.registry.findMany({
			where: eq(registry.organizationId, ctx.session.activeOrganizationId),
		});
		return redactSecretFieldsList(registryResponse, ["password"]);
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
			return redactSecretFields(registry, ["password"]);
		}),
	testRegistry: withPermission("registry", "read")
		.input(apiTestRegistry)
		.mutation(async ({ input, ctx }) => {
			try {
				const args = [
					"login",
					input.registryUrl,
					"--username",
					input.username,
					"--password-stdin",
				];

				assertCloudRegistryTestServer(input.serverId);
				await assertRegistryServerAccess(ctx, input.serverId);

				if (input.serverId && input.serverId !== "none") {
					await execAsyncRemote(
						input.serverId,
						safeDockerLoginCommand(
							input.registryUrl,
							input.username,
							input.password,
						),
					);
				} else {
					await execFileAsync("docker", args, {
						input: Buffer.from(input.password).toString(),
					});
				}

				return true;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: sanitizeRegistryTestError(error, input.password),
					cause: error,
				});
			}
		}),
	testRegistryById: withPermission("registry", "create")
		.input(apiTestRegistryById)
		.mutation(async ({ input, ctx }) => {
			let registryPassword: string | null | undefined;
			try {
				await assertStoredRegistryRemoteTestAccess(ctx, input.serverId);

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
				registryPassword = registryData.password;

				const args = [
					"login",
					registryData.registryUrl,
					"--username",
					registryData.username,
					"--password-stdin",
				];

				if (isRemoteRegistryTestServer(input.serverId)) {
					await execAsyncRemote(
						input.serverId ?? null,
						safeDockerLoginCommand(
							registryData.registryUrl,
							registryData.username,
							registryData.password,
						),
					);
				} else {
					await execFileAsync("docker", args, {
						input: Buffer.from(registryData.password).toString(),
					});
				}

				return true;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: sanitizeRegistryTestError(error, registryPassword),
					cause: error,
				});
			}
		}),
});
