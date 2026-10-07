import {
	createLogProvider,
	deployLogManagement,
	findLogProviderForOrganization,
	findLogProvidersByOrganization,
	getLogManagementServerStatus,
	logProviderAdapters,
	removeLogManagement,
	removeLogProvider,
	sanitizeLogProvider,
	testLogProviderConnection,
	updateLogProvider,
} from "@dokploy/server";
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
			const provider = await findLogProviderForOrganization(
				logProviderId,
				ctx.session.activeOrganizationId,
			);
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
			const provider = await findLogProviderForOrganization(
				input.logProviderId,
				ctx.session.activeOrganizationId,
			);
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
			return await findLogProviderForOrganization(
				input.logProviderId,
				ctx.session.activeOrganizationId,
			);
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
			await findLogProviderForOrganization(
				input.logProviderId,
				ctx.session.activeOrganizationId,
			);
			return await testLogProviderConnection({
				logProviderId: input.logProviderId,
			});
		}),
	serverStatus: withPermission("logProvider", "read").query(({ ctx }) =>
		getLogManagementServerStatus(ctx.session),
	),
	deployOnServer: withPermission("logProvider", "create")
		.input(
			z.object({
				serverId: z.string().nullable().optional(),
				logProviderIds: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await deployLogManagement(
				ctx.session,
				input.serverId ?? undefined,
				input.logProviderIds,
			);
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
			await removeLogManagement(ctx.session, input.serverId ?? undefined);
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
