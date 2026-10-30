import {
	getAllBackupsForOrganization,
	getAllDomainsForOrganization,
	getAllServicesForOrganization,
} from "@dokploy/server";
import {
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

const getAccessibleServices = (
	accessedServices: string[] | null,
	apiKeyScope?: { services: string[] },
) => {
	// No API-key scope means legacy, unrestricted API-key behavior.
	if (!apiKeyScope) {
		return accessedServices;
	}

	// Privileged members have no membership-level service restriction.
	if (accessedServices === null) {
		return apiKeyScope.services;
	}

	// Apply both membership access and API-key scope.
	const allowedServices = new Set(apiKeyScope.services);

	return accessedServices.filter((serviceId) => allowedServices.has(serviceId));
};

export const overviewRouter = createTRPCRouter({
	services: withPermission("service", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		const accessedServices =
			ctx.user.role !== "owner" && ctx.user.role !== "admin"
				? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
				: null;

		return getAllServicesForOrganization(
			orgId,
			getAccessibleServices(accessedServices, ctx.apiKeyScope),
		);
	}),

	// Reads backup and/or volumeBackup run history depending on which the user can see.
	backups: protectedProcedure.query(async ({ ctx }) => {
		const [canReadBackups, canReadVolumeBackups] = await Promise.all([
			hasPermission(ctx, { backup: ["read"] }),
			hasPermission(ctx, { volumeBackup: ["read"] }),
		]);

		if (!canReadBackups && !canReadVolumeBackups) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to backups or volume backups",
			});
		}

		const orgId = ctx.session.activeOrganizationId;
		const accessedServices =
			ctx.user.role !== "owner" && ctx.user.role !== "admin"
				? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
				: null;

		return getAllBackupsForOrganization(
			orgId,
			getAccessibleServices(accessedServices, ctx.apiKeyScope),
			{
				backup: canReadBackups,
				volumeBackup: canReadVolumeBackups,
			},
		);
	}),

	domains: withPermission("domain", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		const accessedServices =
			ctx.user.role !== "owner" && ctx.user.role !== "admin"
				? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
				: null;

		return getAllDomainsForOrganization(
			orgId,
			getAccessibleServices(accessedServices, ctx.apiKeyScope),
		);
	}),
});
