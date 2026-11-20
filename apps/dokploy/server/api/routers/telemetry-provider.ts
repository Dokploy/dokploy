import {
	applyVectorAgentSelection,
	createTelemetryProvider,
	findTelemetryProviderForOrganization,
	findTelemetryProvidersByOrganization,
	getVectorAgentTargets,
	reconcileVectorTargets,
	removeTelemetryProvider,
	sanitizeTelemetryProvider,
	telemetryProviderAdapters,
	testTelemetryProviderConnection,
	updateTelemetryProvider,
} from "@dokploy/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateTelemetryProvider,
	apiFindOneTelemetryProvider,
	apiRemoveTelemetryProvider,
	apiTestTelemetryProvider,
	apiUpdateTelemetryProvider,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

export const telemetryProviderRouter = createTRPCRouter({
	create: withPermission("telemetryProvider", "create")
		.input(apiCreateTelemetryProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await createTelemetryProvider(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "telemetryProvider",
				resourceId: provider.telemetryProviderId,
				resourceName: provider.name,
			});
			return sanitizeTelemetryProvider(provider);
		}),
	update: withPermission("telemetryProvider", "create")
		.input(apiUpdateTelemetryProvider)
		.mutation(async ({ ctx, input }) => {
			const { telemetryProviderId, ...rest } = input;
			const provider = await findTelemetryProviderForOrganization(
				telemetryProviderId,
				ctx.session.activeOrganizationId,
			);
			const { provider: updated, targets } = await updateTelemetryProvider(
				telemetryProviderId,
				rest,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "telemetryProvider",
				resourceId: telemetryProviderId,
				resourceName: provider.name,
			});
			const warning = await reconcileVectorTargets(targets);
			return {
				...sanitizeTelemetryProvider(updated),
				warning,
				reapplied: targets.length > 0,
			};
		}),
	remove: withPermission("telemetryProvider", "delete")
		.input(apiRemoveTelemetryProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await findTelemetryProviderForOrganization(
				input.telemetryProviderId,
				ctx.session.activeOrganizationId,
			);
			const { provider: removed, targets } = await removeTelemetryProvider(
				input.telemetryProviderId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "telemetryProvider",
				resourceId: provider.telemetryProviderId,
				resourceName: provider.name,
			});
			const warning = await reconcileVectorTargets(targets);
			return { ...sanitizeTelemetryProvider(removed), warning };
		}),
	all: withPermission("telemetryProvider", "read").query(async ({ ctx }) => {
		return await findTelemetryProvidersByOrganization(
			ctx.session.activeOrganizationId,
		);
	}),
	one: withPermission("telemetryProvider", "read")
		.input(apiFindOneTelemetryProvider)
		.query(async ({ ctx, input }) => {
			return await findTelemetryProviderForOrganization(
				input.telemetryProviderId,
				ctx.session.activeOrganizationId,
			);
		}),
	testConnection: withPermission("telemetryProvider", "create")
		.input(apiTestTelemetryProvider)
		.mutation(async ({ input }) => {
			return await testTelemetryProviderConnection({
				providerType: input.providerType,
				config: {
					telemetryProviderId: "test",
					name: input.name ?? "test",
					signals: input.signals,
					endpoint: input.endpoint ?? null,
					apiKey: input.apiKey ?? null,
					apiSecret: input.apiSecret ?? null,
					extraConfig: input.extraConfig ?? null,
				},
			});
		}),
	testConnectionById: withPermission("telemetryProvider", "create")
		.input(
			apiFindOneTelemetryProvider.extend({
				signals: z
					.array(z.enum(["logs", "metrics"]))
					.min(1)
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await findTelemetryProviderForOrganization(
				input.telemetryProviderId,
				ctx.session.activeOrganizationId,
			);
			return await testTelemetryProviderConnection({
				telemetryProviderId: input.telemetryProviderId,
				signals: input.signals,
			});
		}),
	serverStatus: withPermission("telemetryProvider", "read").query(({ ctx }) =>
		getVectorAgentTargets(ctx.session),
	),
	deployOnServer: withPermission("telemetryProvider", "create")
		.input(
			z.object({
				serverId: z.string().min(1).nullable().optional(),
				providerIds: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { serverName } = await applyVectorAgentSelection(
				ctx.session,
				input.serverId ?? undefined,
				input.providerIds,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: serverName,
				metadata: { providerIds: input.providerIds },
			});
			return { installed: true };
		}),
	removeOnServer: withPermission("telemetryProvider", "create")
		.input(
			z.object({
				serverId: z.string().min(1).nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { serverName } = await applyVectorAgentSelection(
				ctx.session,
				input.serverId ?? undefined,
				[],
			);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: serverName,
				metadata: { providerIds: [] },
			});
			return { installed: false };
		}),
	availableTypes: protectedProcedure.query(() => {
		return Object.values(telemetryProviderAdapters).map((adapter) => ({
			type: adapter.type,
			label: adapter.label,
			docsUrl: adapter.docsUrl,
			credentialFields: adapter.credentialFields,
			signals: adapter.signals,
		}));
	}),
});
