import {
	assertLogProvidersBelongToOrg,
	assertServerBelongsToOrg,
	claimWebServerLogManagement,
	createLogProvider,
	findLogProviderById,
	findLogProvidersByOrganization,
	getLogManagementServerStatus,
	logProviderAdapters,
	removeLogProvider,
	removeVectorAgent,
	sanitizeLogProvider,
	setupVectorAgent,
	testLogProviderConnection,
	updateLogProvider,
	updateServerLogProviders,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateLogProvider,
	apiFindOneLogProvider,
	apiRemoveLogProvider,
	apiTestLogProvider,
	apiUpdateLogProvider,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

export const logProviderRouter = createTRPCRouter({
	create: withPermission("logProvider", "create")
		.input(apiCreateLogProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await createLogProvider(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "logProvider",
				resourceId: provider.logProviderId,
				resourceName: provider.name,
			});
			return sanitizeLogProvider(provider);
		}),
	update: withPermission("logProvider", "create")
		.input(apiUpdateLogProvider)
		.mutation(async ({ ctx, input }) => {
			const { logProviderId, ...rest } = input;
			const provider = await findLogProviderById(logProviderId);
			if (provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this log provider",
				});
			}
			const updated = await updateLogProvider(logProviderId, rest);
			await audit(ctx, {
				action: "update",
				resourceType: "logProvider",
				resourceId: logProviderId,
				resourceName: provider.name,
			});
			return sanitizeLogProvider(updated);
		}),
	remove: withPermission("logProvider", "delete")
		.input(apiRemoveLogProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await findLogProviderById(input.logProviderId);
			if (provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this log provider",
				});
			}
			const removed = await removeLogProvider(input.logProviderId);
			await audit(ctx, {
				action: "delete",
				resourceType: "logProvider",
				resourceId: provider.logProviderId,
				resourceName: provider.name,
			});
			return sanitizeLogProvider(removed);
		}),
	all: withPermission("logProvider", "read").query(async ({ ctx }) => {
		return await findLogProvidersByOrganization(
			ctx.session.activeOrganizationId,
		);
	}),
	one: withPermission("logProvider", "read")
		.input(apiFindOneLogProvider)
		.query(async ({ ctx, input }) => {
			const provider = await findLogProviderById(input.logProviderId);
			if (provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this log provider",
				});
			}
			return provider;
		}),
	testConnection: withPermission("logProvider", "create")
		.input(apiTestLogProvider)
		.mutation(async ({ input }) => {
			return await testLogProviderConnection({
				providerType: input.providerType,
				config: {
					logProviderId: "test",
					name: input.name ?? "test",
					endpoint: input.endpoint ?? null,
					apiKey: input.apiKey ?? null,
					apiSecret: input.apiSecret ?? null,
					extraConfig: input.extraConfig ?? null,
				},
			});
		}),
	testConnectionById: withPermission("logProvider", "create")
		.input(apiFindOneLogProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await findLogProviderById(input.logProviderId);
			if (provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this log provider",
				});
			}
			return await testLogProviderConnection({
				logProviderId: input.logProviderId,
			});
		}),
	serverStatus: withPermission("logProvider", "read").query(({ ctx }) =>
		getLogManagementServerStatus(ctx.session.activeOrganizationId),
	),
	deployOnServer: withPermission("logProvider", "create")
		.input(
			z.object({
				serverId: z.string().nullable().optional(),
				logProviderIds: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.activeOrganizationId;
			const serverId = input.serverId ?? undefined;
			await assertServerBelongsToOrg(serverId, organizationId);
			await assertLogProvidersBelongToOrg(input.logProviderIds, organizationId);

			if (serverId) {
				await updateServerLogProviders(serverId, input.logProviderIds);
			} else {
				const claimed = await claimWebServerLogManagement(
					organizationId,
					input.logProviderIds,
				);
				if (!claimed) {
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"The local Vector agent is already claimed by another organization",
					});
				}
			}

			await setupVectorAgent(organizationId, serverId, input.logProviderIds);
			await audit(ctx, {
				action: "create",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: "log-management",
			});
			return { installed: true };
		}),
	removeOnServer: withPermission("logProvider", "create")
		.input(z.object({ serverId: z.string().nullable().optional() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.activeOrganizationId;
			const serverId = input.serverId ?? undefined;
			await assertServerBelongsToOrg(serverId, organizationId);

			await removeVectorAgent(serverId);
			if (serverId) {
				await updateServerLogProviders(serverId, []);
			} else {
				await claimWebServerLogManagement(organizationId, []);
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: "log-management",
			});
			return { installed: false };
		}),
	availableTypes: protectedProcedure.query(() => {
		return Object.values(logProviderAdapters).map((adapter) => ({
			type: adapter.type,
			label: adapter.label,
			docsUrl: adapter.docsUrl,
			credentialFields: adapter.credentialFields,
		}));
	}),
});
