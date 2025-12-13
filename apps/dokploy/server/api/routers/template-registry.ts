import {
	createTemplateRegistry,
	ensureDefaultRegistry,
	findEnabledTemplateRegistries,
	findTemplateRegistriesByOrganizationId,
	findTemplateRegistryById,
	removeTemplateRegistry,
	syncTemplateRegistry,
	toggleTemplateRegistry,
	updateTemplateRegistry,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import {
	apiCreateTemplateRegistry,
	apiFindOneTemplateRegistry,
	apiRemoveTemplateRegistry,
	apiToggleTemplateRegistry,
	apiUpdateTemplateRegistry,
} from "@/server/db/schema";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

export const templateRegistryRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateTemplateRegistry)
		.mutation(async ({ ctx, input }) => {
			return await createTemplateRegistry(
				input,
				ctx.session.activeOrganizationId,
			);
		}),

	remove: adminProcedure
		.input(apiRemoveTemplateRegistry)
		.mutation(async ({ ctx, input }) => {
			const registry = await findTemplateRegistryById(
				input.templateRegistryId,
			);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this registry",
				});
			}
			return await removeTemplateRegistry(input.templateRegistryId);
		}),

	update: adminProcedure
		.input(apiUpdateTemplateRegistry)
		.mutation(async ({ input, ctx }) => {
			const registry = await findTemplateRegistryById(
				input.templateRegistryId,
			);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this registry",
				});
			}
			return await updateTemplateRegistry(input);
		}),

	toggle: adminProcedure
		.input(apiToggleTemplateRegistry)
		.mutation(async ({ input, ctx }) => {
			const registry = await findTemplateRegistryById(
				input.templateRegistryId,
			);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to modify this registry",
				});
			}
			return await toggleTemplateRegistry(
				input.templateRegistryId,
				input.isEnabled,
			);
		}),

	sync: adminProcedure
		.input(apiFindOneTemplateRegistry)
		.mutation(async ({ input, ctx }) => {
			const registry = await findTemplateRegistryById(
				input.templateRegistryId,
			);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to sync this registry",
				});
			}
			return await syncTemplateRegistry(input.templateRegistryId);
		}),

	all: protectedProcedure.query(async ({ ctx }) => {
		// Ensure default registry exists
		await ensureDefaultRegistry(ctx.session.activeOrganizationId);
		return await findTemplateRegistriesByOrganizationId(
			ctx.session.activeOrganizationId,
		);
	}),

	enabled: protectedProcedure.query(async ({ ctx }) => {
		// Ensure default registry exists
		await ensureDefaultRegistry(ctx.session.activeOrganizationId);
		return await findEnabledTemplateRegistries(
			ctx.session.activeOrganizationId,
		);
	}),

	one: protectedProcedure
		.input(apiFindOneTemplateRegistry)
		.query(async ({ input, ctx }) => {
			const registry = await findTemplateRegistryById(
				input.templateRegistryId,
			);
			if (registry.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this registry",
				});
			}
			return registry;
		}),
});

