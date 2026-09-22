import { db } from "@dokploy/server/db";
import {
	invitation,
	member,
	team,
	user,
} from "@dokploy/server/db/schema";
import {
	sanitizeTeamName,
	validateTeamCapacity,
} from "@dokploy/server/services/organization-teams";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

const teamInput = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).nullable().optional(),
	maxMembers: z.number().int().min(1).max(10000).nullable().optional(),
	accessedServers: z.array(z.string().min(1)).max(1000).default([]),
});

export const teamRouter = createTRPCRouter({
	all: protectedProcedure.query(async ({ ctx }) => {
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.organizationId, ctx.session.activeOrganizationId),
				eq(member.userId, ctx.user.id),
			),
		});
		if (!membership) {
			throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
		}
		return await db.query.team.findMany({
			where: eq(team.organizationId, ctx.session.activeOrganizationId),
		});
	}),

	create: withPermission("team", "create")
		.input(teamInput)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const name = sanitizeTeamName(input.name);
			const existing = await db.query.team.findFirst({
				where: and(eq(team.organizationId, orgId), eq(team.name, name)),
			});
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Team "${name}" already exists`,
				});
			}
			const [created] = await db
				.insert(team)
				.values({
					id: nanoid(),
					organizationId: orgId,
					name,
					description: input.description ?? null,
					maxMembers: input.maxMembers ?? null,
					accessedServers: input.accessedServers ?? [],
				})
				.returning();
			await audit(ctx, {
				action: "create",
				resourceType: "team",
				resourceId: created?.id,
				resourceName: name,
			});
			return created;
		}),

	update: withPermission("team", "update")
		.input(
			teamInput.partial().extend({
				teamId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const current = await db.query.team.findFirst({
				where: eq(team.id, input.teamId),
			});
			if (!current || current.organizationId !== orgId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
			}
			if (input.maxMembers !== undefined && input.maxMembers !== null) {
				const assigned = await db.query.member.findMany({
					where: and(
						eq(member.organizationId, orgId),
						eq(member.teamId, input.teamId),
					),
				});
				validateTeamCapacity(assigned.length, input.maxMembers, 0);
			}
			const [updated] = await db
				.update(team)
				.set({
					...(input.name !== undefined && {
						name: sanitizeTeamName(input.name),
					}),
					...(input.description !== undefined && {
						description: input.description,
					}),
					...(input.maxMembers !== undefined && {
						maxMembers: input.maxMembers,
					}),
					...(input.accessedServers !== undefined && {
						accessedServers: input.accessedServers,
					}),
				})
				.where(eq(team.id, input.teamId))
				.returning();
			await audit(ctx, {
				action: "update",
				resourceType: "team",
				resourceId: input.teamId,
				resourceName: updated?.name ?? input.teamId,
			});
			return updated;
		}),

	remove: withPermission("team", "delete")
		.input(z.object({ teamId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const current = await db.query.team.findFirst({
				where: eq(team.id, input.teamId),
			});
			if (!current || current.organizationId !== orgId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
			}
			await db
				.update(member)
				.set({ teamId: null })
				.where(
					and(
						eq(member.organizationId, orgId),
						eq(member.teamId, input.teamId),
					),
				);
			await db.delete(team).where(eq(team.id, input.teamId));
			await db
				.update(invitation)
				.set({ teamId: null })
				.where(
					and(
						eq(invitation.organizationId, orgId),
						eq(invitation.teamId, input.teamId),
					),
				);
			await audit(ctx, {
				action: "delete",
				resourceType: "team",
				resourceId: input.teamId,
				resourceName: current.name,
			});
			return { success: true };
		}),

	moveMember: withPermission("member", "update")
		.input(
			z.object({
				memberId: z.string().min(1),
				teamId: z.string().min(1).nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const target = await db.query.member.findFirst({
				where: eq(member.id, input.memberId),
			});
			if (!target || target.organizationId !== orgId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
			}
			if (input.teamId) {
				const destination = await db.query.team.findFirst({
					where: eq(team.id, input.teamId),
				});
				if (!destination || destination.organizationId !== orgId) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
				}
				const assigned = await db.query.member.findMany({
					where: and(
						eq(member.organizationId, orgId),
						eq(member.teamId, input.teamId),
					),
				});
				const alreadyThere = assigned.some((m) => m.id === target.id);
				if (!alreadyThere) {
					validateTeamCapacity(assigned.length, destination.maxMembers, 1);
				}
			}
			await db
				.update(member)
				.set({ teamId: input.teamId })
				.where(eq(member.id, input.memberId));
			await audit(ctx, {
				action: "update",
				resourceType: "team",
				resourceId: input.teamId ?? "no-team",
				resourceName: target.userId,
				metadata: { type: "moveMember", memberId: input.memberId },
			});
			return { success: true };
		}),

	members: protectedProcedure
		.input(z.object({ teamId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const current = await db.query.team.findFirst({
				where: eq(team.id, input.teamId),
			});
			if (!current || current.organizationId !== orgId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
			}
			return await db
				.select({
					id: member.id,
					userId: member.userId,
					role: member.role,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
				})
				.from(member)
				.innerJoin(user, eq(member.userId, user.id))
				.where(
					and(eq(member.organizationId, orgId), eq(member.teamId, input.teamId)),
				);
		}),

	unassigned: protectedProcedure.query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		return await db
			.select({
				id: member.id,
				userId: member.userId,
				role: member.role,
				email: user.email,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(eq(member.organizationId, orgId), isNull(member.teamId)));
	}),
});

export const assertTeamExistsInOrg = async (
	orgId: string,
	teamId: string | null | undefined,
) => {
	if (!teamId) return null;
	const found = await db.query.team.findFirst({
		where: eq(team.id, teamId),
	});
	if (!found || found.organizationId !== orgId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
	}
	return found;
};
