import { IS_CLOUD } from "@dokploy/server/index";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, exists } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/server/db";
import { invitation, member, organization } from "@/server/db/schema";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
export const organizationRouter = createTRPCRouter({
	create: protectedProcedure
		.input(
			z.object({
				name: z.string(),
				logo: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && !IS_CLOUD) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the organization owner can create an organization",
				});
			}
			const result = await db
				.insert(organization)
				.values({
					...input,
					slug: nanoid(),
					createdAt: new Date(),
					ownerId: ctx.user.id,
				})
				.returning()
				.then((res) => res[0]);

			console.log("result", result);

			if (!result) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create organization",
				});
			}

			await db.insert(member).values({
				organizationId: result.id,
				role: "owner",
				createdAt: new Date(),
				userId: ctx.user.id,
			});
			return result;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		const memberResult = await db.query.organization.findMany({
			where: (organization) =>
				exists(
					db
						.select()
						.from(member)
						.where(
							and(
								eq(member.organizationId, organization.id),
								eq(member.userId, ctx.user.id),
							),
						),
				),
		});
		return memberResult;
	}),
	one: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			return await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});
		}),
	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
				name: z.string(),
				logo: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && !IS_CLOUD) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the organization owner can update it",
				});
			}
			const result = await db
				.update(organization)
				.set({
					name: input.name,
					logo: input.logo,
				})
				.where(eq(organization.id, input.organizationId))
				.returning();
			return result[0];
		}),
	delete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && !IS_CLOUD) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the organization owner can delete it",
				});
			}
			const org = await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			if (org.ownerId !== ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the organization owner can delete it",
				});
			}

			const ownerOrgs = await db.query.organization.findMany({
				where: eq(organization.ownerId, ctx.user.id),
			});

			if (ownerOrgs.length <= 1) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"You must maintain at least one organization where you are the owner",
				});
			}

			const result = await db
				.delete(organization)
				.where(eq(organization.id, input.organizationId));

			return result;
		}),
	allInvitations: adminProcedure.query(async ({ ctx }) => {
		return await db.query.invitation.findMany({
			where: eq(invitation.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(invitation.status), desc(invitation.expiresAt)],
		});
	}),
	removeInvitation: adminProcedure
		.input(z.object({ invitationId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const invitationResult = await db.query.invitation.findFirst({
				where: eq(invitation.id, input.invitationId),
			});

			if (!invitationResult) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invitation not found",
				});
			}

			if (
				invitationResult?.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not allowed to remove this invitation",
				});
			}

			return await db
				.delete(invitation)
				.where(eq(invitation.id, input.invitationId));
		}),
});
