import {
	createLogProvider,
	findLogProviderById,
	findLogProvidersByOrganization,
	logProviderAdapters,
	removeLogProvider,
	sanitizeLogProvider,
	testLogProviderConnection,
	updateLogProvider,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateLogProvider,
	apiFindOneLogProvider,
	apiRemoveLogProvider,
	apiTestLogProvider,
	apiUpdateLogProvider,
} from "@/server/db/schema";
import { safeSyncVectorAgentsForOrganization } from "@/server/utils/vector-resync";
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
			const syncErrors = await safeSyncVectorAgentsForOrganization(
				ctx.session.activeOrganizationId,
			);
			return { ...sanitizeLogProvider(provider), syncErrors };
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
			const syncErrors = await safeSyncVectorAgentsForOrganization(
				ctx.session.activeOrganizationId,
			);
			return { ...sanitizeLogProvider(updated), syncErrors };
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
			const syncErrors = await safeSyncVectorAgentsForOrganization(
				ctx.session.activeOrganizationId,
			);
			return { ...sanitizeLogProvider(removed), syncErrors };
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
	availableTypes: protectedProcedure.query(() => {
		return Object.values(logProviderAdapters).map((adapter) => ({
			type: adapter.type,
			label: adapter.label,
			docsUrl: adapter.docsUrl,
			credentialFields: adapter.credentialFields,
		}));
	}),
});
