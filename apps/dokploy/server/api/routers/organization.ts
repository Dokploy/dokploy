import {
	apiCreateOrganizationOutput,
	apiDeleteOrganizationOutput,
	apiFindAllOrganizationsOutput,
	apiFindOneOrganizationOutput,
	apiUpdateOrganizationOutput,
} from "@dokploy/server/api";
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
		.output(apiCreateOrganizationOutput)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin" && !IS_CLOUD) {
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

			// Check if this is the user's first organization
			const existingMemberships = await db.query.member.findMany({
				where: eq(member.userId, ctx.user.id),
			});

			await db.insert(member).values({
				organizationId: result.id,
				role: "owner",
				createdAt: new Date(),
				userId: ctx.user.id,
			});
			return result;
		}),
	all: protectedProcedure.output(apiFindAllOrganizationsOutput).query(async ({ ctx }) => {
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
			with: {
				members: {
					where: eq(member.userId, ctx.user.id),
				},
			},
		});
		return memberResult;
	}),
	one: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.output(apiFindOneOrganizationOutput)
		.query(async ({ input }) => {
			const org = await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			return org;
		}),
	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
				name: z.string(),
				logo: z.string().optional(),
			}),
		)
		.output(apiUpdateOrganizationOutput)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin" && !IS_CLOUD) {
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

			if (!result[0]) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			return result[0];
		}),
	delete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.output(apiDeleteOrganizationOutput)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin" && !IS_CLOUD) {
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
				.where(eq(organization.id, input.organizationId))
				.returning();

			if (!result[0]) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			return result[0];
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
	updateMemberRole: adminProcedure
		.input(
			z.object({
				memberId: z.string(),
				role: z.enum(["admin", "member"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Fetch the target member
			const target = await db.query.member.findFirst({
				where: eq(member.id, input.memberId),
				with: { user: true },
			});

			if (!target) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
			}

			if (target.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not allowed to update this member's role",
				});
			}

			// Prevent users from changing their own role
			if (target.userId === ctx.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You cannot change your own role",
				});
			}

			// Owner role is intransferible - cannot change to or from owner
			if (target.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "The owner role is intransferible",
				});
			}

			// Only owners can change admin roles
			// Admins can only change member roles
			if (ctx.user.role === "admin" && target.role === "admin") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Only the organization owner can change admin roles. Admins can only modify member roles.",
				});
			}

			// Update the target member's role
			await db
				.update(member)
				.set({ role: input.role })
				.where(eq(member.id, input.memberId));

			return true;
		}),
	setDefault: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Verify user is a member of this organization
			const userMember = await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, input.organizationId),
					eq(member.userId, ctx.user.id),
				),
			});

			if (!userMember) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
				});
			}

			// First, unset all defaults for this user
			await db
				.update(member)
				.set({ isDefault: false })
				.where(eq(member.userId, ctx.user.id));

			// Then set this organization as default
			await db
				.update(member)
				.set({ isDefault: true })
				.where(
					and(
						eq(member.organizationId, input.organizationId),
						eq(member.userId, ctx.user.id),
					),
				);

			return { success: true };
		}),
});
