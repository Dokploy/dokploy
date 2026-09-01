import {
	createDnsProvider,
	createDnsProviderRecord,
	deleteDnsProviderRecord,
	findDnsProviderInOrganization,
	findDnsProvidersByOrganizationId,
	listDnsProviderRecords,
	listDnsProviderZones,
	maskDnsProviderConfig,
	mergeDnsProviderConfig,
	removeDnsProvider,
	testDnsProviderConnection,
	updateDnsProvider,
	updateDnsProviderRecord,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateDnsProvider,
	apiCreateDnsRecord,
	apiDeleteDnsRecord,
	apiFindOneDnsProvider,
	apiListDnsRecords,
	apiListDnsZones,
	apiRemoveDnsProvider,
	apiTestDnsProvider,
	apiUpdateDnsProvider,
	apiUpdateDnsRecord,
} from "@/server/db/schema";
import { createTRPCRouter, withPermission } from "../trpc";

export const dnsProviderRouter = createTRPCRouter({
	create: withPermission("dnsProvider", "create")
		.input(apiCreateDnsProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await createDnsProvider(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "dnsProvider",
				resourceId: provider.dnsProviderId,
				resourceName: provider.name,
			});
			return { ...provider, config: maskDnsProviderConfig(provider.config) };
		}),

	update: withPermission("dnsProvider", "update")
		.input(apiUpdateDnsProvider)
		.mutation(async ({ ctx, input }) => {
			await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			const updated = await updateDnsProvider(
				input.dnsProviderId,
				input.name,
				input.config,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "dnsProvider",
				resourceId: updated.dnsProviderId,
				resourceName: updated.name,
			});
			return { ...updated, config: maskDnsProviderConfig(updated.config) };
		}),

	remove: withPermission("dnsProvider", "delete")
		.input(apiRemoveDnsProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "dnsProvider",
				resourceId: provider.dnsProviderId,
				resourceName: provider.name,
			});
			await removeDnsProvider(input.dnsProviderId);
			return true;
		}),

	all: withPermission("dnsProvider", "read").query(async ({ ctx }) => {
		const providers = await findDnsProvidersByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		return providers.map((provider) => ({
			...provider,
			config: maskDnsProviderConfig(provider.config),
		}));
	}),

	one: withPermission("dnsProvider", "read")
		.input(apiFindOneDnsProvider)
		.query(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			return { ...provider, config: maskDnsProviderConfig(provider.config) };
		}),

	testConnection: withPermission("dnsProvider", "create")
		.input(apiTestDnsProvider)
		.mutation(async ({ ctx, input }) => {
			if (!input.config && !input.dnsProviderId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provide a config or a dnsProviderId to test",
				});
			}

			let config = input.config;
			if (input.dnsProviderId) {
				const provider = await findDnsProviderInOrganization(
					input.dnsProviderId,
					ctx.session.activeOrganizationId,
				);
				config = config
					? mergeDnsProviderConfig(config, provider.config)
					: provider.config;
			}

			await testDnsProviderConnection(config!);
			return true;
		}),

	listZones: withPermission("dnsProvider", "read")
		.input(apiListDnsZones)
		.query(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			return await listDnsProviderZones(provider.config);
		}),

	listRecords: withPermission("dnsProvider", "read")
		.input(apiListDnsRecords)
		.query(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			return await listDnsProviderRecords(provider.config, input.zoneId);
		}),

	createRecord: withPermission("dnsProvider", "update")
		.input(apiCreateDnsRecord)
		.mutation(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			const record = await createDnsProviderRecord(provider.config, {
				zoneId: input.zoneId,
				type: input.type,
				name: input.name,
				content: input.content,
				ttl: input.ttl,
				proxied: input.proxied,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "dnsProvider",
				resourceId: record.id,
				resourceName: input.name,
			});
			return record;
		}),

	updateRecord: withPermission("dnsProvider", "update")
		.input(apiUpdateDnsRecord)
		.mutation(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			const record = await updateDnsProviderRecord(
				provider.config,
				input.zoneId,
				input.recordId,
				{
					type: input.type,
					name: input.name,
					content: input.content,
					ttl: input.ttl,
					proxied: input.proxied,
				},
			);
			await audit(ctx, {
				action: "update",
				resourceType: "dnsProvider",
				resourceId: record.id,
				resourceName: input.name,
			});
			return record;
		}),

	deleteRecord: withPermission("dnsProvider", "delete")
		.input(apiDeleteDnsRecord)
		.mutation(async ({ ctx, input }) => {
			const provider = await findDnsProviderInOrganization(
				input.dnsProviderId,
				ctx.session.activeOrganizationId,
			);
			await deleteDnsProviderRecord(
				provider.config,
				input.zoneId,
				input.recordId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "dnsProvider",
				resourceId: input.recordId,
				resourceName: input.zoneId,
			});
			return true;
		}),
});
