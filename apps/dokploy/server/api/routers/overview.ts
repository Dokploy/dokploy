import {
	countActiveDeploymentsByOrganization,
	getAllBackupsForOrganization,
	getAllDomainsForOrganization,
	getAllServicesForOrganization,
} from "@dokploy/server";
import {
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { applicationStatus } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

export const overviewRouter = createTRPCRouter({
	services: withPermission("service", "read")
		.input(
			z
				.object({ status: z.enum(applicationStatus.enumValues).optional() })
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const orgId = ctx.session.activeOrganizationId;
			const accessedServices =
				ctx.user.role !== "owner" && ctx.user.role !== "admin"
					? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
					: null;
			return getAllServicesForOrganization(
				orgId,
				accessedServices,
				input?.status,
			);
		}),

	activeDeploymentsByOrganization: protectedProcedure.query(async ({ ctx }) => {
		// An API key is scoped to a single organization (see validateRequest); never let it enumerate the owner's other memberships.
		const isApiKeyRequest = !!ctx.req.headers["x-api-key"];
		return countActiveDeploymentsByOrganization(
			ctx.user.id,
			isApiKeyRequest ? ctx.session.activeOrganizationId : null,
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
		return getAllBackupsForOrganization(orgId, accessedServices, {
			backup: canReadBackups,
			volumeBackup: canReadVolumeBackups,
		});
	}),

	domains: withPermission("domain", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		const accessedServices =
			ctx.user.role !== "owner" && ctx.user.role !== "admin"
				? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
				: null;
		return getAllDomainsForOrganization(orgId, accessedServices);
	}),
});
