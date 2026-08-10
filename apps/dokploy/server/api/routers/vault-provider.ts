import {
	createVaultProvider,
	findVaultProviderById,
	findVaultProvidersByOrganizationId,
	listVaultProviderSecretNames,
	maskVaultProviderConfig,
	mergeVaultProviderConfig,
	removeVaultProvider,
	testVaultProviderConnection,
	updateVaultProvider,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateVaultProvider,
	apiFindOneVaultProvider,
	apiListVaultSecretNames,
	apiRemoveVaultProvider,
	apiTestVaultProvider,
	apiUpdateVaultProvider,
} from "@/server/db/schema";
import { createTRPCRouter, withPermission } from "../trpc";

const findInOrganization = async (
	vaultProviderId: string,
	organizationId: string,
) => {
	const provider = await findVaultProviderById(vaultProviderId);
	if (provider.organizationId !== organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this vault provider",
		});
	}
	return provider;
};

export const vaultProviderRouter = createTRPCRouter({
	create: withPermission("vaultProvider", "create")
		.input(apiCreateVaultProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await createVaultProvider(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "vaultProvider",
				resourceId: provider.vaultProviderId,
				resourceName: provider.name,
			});
			return { ...provider, config: maskVaultProviderConfig(provider.config) };
		}),

	update: withPermission("vaultProvider", "update")
		.input(apiUpdateVaultProvider)
		.mutation(async ({ ctx, input }) => {
			await findInOrganization(
				input.vaultProviderId,
				ctx.session.activeOrganizationId,
			);
			const updated = await updateVaultProvider(
				input.vaultProviderId,
				input.name,
				input.config,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "vaultProvider",
				resourceId: updated.vaultProviderId,
				resourceName: updated.name,
			});
			return { ...updated, config: maskVaultProviderConfig(updated.config) };
		}),

	remove: withPermission("vaultProvider", "delete")
		.input(apiRemoveVaultProvider)
		.mutation(async ({ ctx, input }) => {
			const provider = await findInOrganization(
				input.vaultProviderId,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "vaultProvider",
				resourceId: provider.vaultProviderId,
				resourceName: provider.name,
			});
			await removeVaultProvider(input.vaultProviderId);
			return true;
		}),

	all: withPermission("vaultProvider", "read").query(async ({ ctx }) => {
		const providers = await findVaultProvidersByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		return providers.map((provider) => ({
			...provider,
			config: maskVaultProviderConfig(provider.config),
		}));
	}),

	one: withPermission("vaultProvider", "read")
		.input(apiFindOneVaultProvider)
		.query(async ({ ctx, input }) => {
			const provider = await findInOrganization(
				input.vaultProviderId,
				ctx.session.activeOrganizationId,
			);
			return { ...provider, config: maskVaultProviderConfig(provider.config) };
		}),

	testConnection: withPermission("vaultProvider", "create")
		.input(apiTestVaultProvider)
		.mutation(async ({ ctx, input }) => {
			if (!input.config && !input.vaultProviderId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provide a config or a vaultProviderId to test",
				});
			}

			let config = input.config;
			if (input.vaultProviderId) {
				const provider = await findInOrganization(
					input.vaultProviderId,
					ctx.session.activeOrganizationId,
				);
				config = config
					? mergeVaultProviderConfig(config, provider.config)
					: provider.config;
			}

			await testVaultProviderConnection(config!);
			return true;
		}),

	listSecretNames: withPermission("vaultProvider", "read")
		.input(apiListVaultSecretNames)
		.query(async ({ ctx, input }) => {
			const provider = await findInOrganization(
				input.vaultProviderId,
				ctx.session.activeOrganizationId,
			);
			return await listVaultProviderSecretNames(provider.config);
		}),
});
