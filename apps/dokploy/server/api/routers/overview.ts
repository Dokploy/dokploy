import {
	getAllBackupsForOrganization,
	getAllDomainsForOrganization,
	getAllServicesForOrganization,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { applicationStatus, member } from "@/server/db/schema";
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

	// Counts deploying services in every organization the user belongs to, applying that org's own membership rules.
	activeDeploymentsByOrganization: protectedProcedure.query(async ({ ctx }) => {
		const memberships = await db.query.member.findMany({
			where: eq(member.userId, ctx.user.id),
			columns: { organizationId: true, role: true, accessedServices: true },
		});

		const entries = await Promise.all(
			memberships.map(async (membership) => {
				const orgCtx = {
					user: ctx.user,
					session: { activeOrganizationId: membership.organizationId },
				};
				if (!(await hasPermission(orgCtx, { service: ["read"] }))) {
					return [membership.organizationId, 0] as const;
				}
				const accessedServices =
					membership.role !== "owner" && membership.role !== "admin"
						? membership.accessedServices
						: null;
				const running = await getAllServicesForOrganization(
					membership.organizationId,
					accessedServices,
					"running",
				);
				return [membership.organizationId, running.length] as const;
			}),
		);

		return Object.fromEntries(entries) as Record<string, number>;
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
