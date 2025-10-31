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

			// Check if this is the user's first organization
			const existingMemberships = await db.query.member.findMany({
				where: eq(member.userId, ctx.user.id),
			});

			const isFirstOrganization = existingMemberships.length === 0;

			await db.insert(member).values({
				organizationId: result.id,
				role: "owner",
				createdAt: new Date(),
				userId: ctx.user.id,
				isDefault: isFirstOrganization, // Mark as default if it's the first organization
			});
			return result;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		// Get all memberships for the user with organization info
		// Query memberships first to get the isDefault value correctly
		const memberships = await db
			.select({
				organizationId: member.organizationId,
				isDefault: member.isDefault,
				createdAt: member.createdAt,
			})
			.from(member)
			.where(eq(member.userId, ctx.user.id));

		// If no default is set, set the oldest organization as default
		const hasDefault = memberships.some((m) => m.isDefault === true);
		if (!hasDefault && memberships.length > 0) {
			// Find the oldest membership (first created)
			const oldestMembership = memberships.reduce((oldest, current) =>
				current.createdAt < oldest.createdAt ? current : oldest,
			);

			// Set it as default
			await db
				.update(member)
				.set({ isDefault: true })
				.where(
					and(
						eq(member.organizationId, oldestMembership.organizationId),
						eq(member.userId, ctx.user.id),
					),
				);

			// Update the memberships array
			const updatedMemberships = memberships.map((m) =>
				m.organizationId === oldestMembership.organizationId
					? { ...m, isDefault: true }
					: m,
			);

			// Get all organizations for the user
			const organizations = await db.query.organization.findMany({
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

			// Create a map of organizationId to isDefault
			const defaultMap = new Map(
				updatedMemberships.map((m) => [m.organizationId, Boolean(m.isDefault)]),
			);

			// Map organizations with their isDefault flag
			return organizations.map((org) => ({
				...org,
				isDefault: defaultMap.get(org.id) ?? false,
			}));
		}

		// Get all organizations for the user
		const organizations = await db.query.organization.findMany({
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

		// Create a map of organizationId to isDefault
		const defaultMap = new Map(
			memberships.map((m) => [m.organizationId, Boolean(m.isDefault)]),
		);

		// Map organizations with their isDefault flag
		return organizations.map((org) => ({
			...org,
			isDefault: defaultMap.get(org.id) ?? false,
		}));
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
	setDefault: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
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
