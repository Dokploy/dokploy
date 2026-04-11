import { db } from "@dokploy/server/db";
import { IS_CLOUD } from "@dokploy/server/index";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, exists } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	invitation,
	member,
	organization,
	organizationRole,
	user,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";
export const organizationRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create an organization",
				description: "Create a new organization and add the current user as the owner. Only owners and admins can create organizations in self-hosted mode.",
			},
		})
		.input(
			z.object({
				name: z.string(),
				logo: z.string().optional(),
			}),
		)
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
			await audit(ctx, {
				action: "create",
				resourceType: "organization",
				resourceId: result.id,
				resourceName: result.name,
			});
			return result;
		}),
	all: protectedProcedure
		.meta({
			openapi: {
				summary: "List all organizations",
				description: "Retrieve all organizations the current user is a member of, including their membership details.",
			},
		})
		.query(async ({ ctx }) => {
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
		.meta({
			openapi: {
				summary: "Get an organization by ID",
				description: "Retrieve a single organization by its ID. The current user must be a member of the organization.",
			},
		})
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
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

			return await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});
		}),
	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update an organization",
				description: "Update the name and logo of an organization. Only the organization owner can perform this action.",
			},
		})
		.input(
			z.object({
				organizationId: z.string(),
				name: z.string(),
				logo: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// First, verify the organization exists
			const org = await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

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

			// Only owners can update the organization
			// Verify the user is either the organization owner or has the owner role
			const isOwner =
				org.ownerId === ctx.user.id || userMember.role === "owner";

			if (!isOwner) {
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
			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: input.organizationId,
				resourceName: input.name,
			});
			return result[0];
		}),
	delete: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete an organization",
				description: "Delete an organization by ID. Only the owner can delete it, and they must retain at least one organization.",
			},
		})
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// First, verify the organization exists
			const org = await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

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

			// Only owners can delete the organization
			// Verify the user is either the organization owner or has the owner role
			const isOwner =
				org.ownerId === ctx.user.id || userMember.role === "owner";

			if (!isOwner) {
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

			await audit(ctx, {
				action: "delete",
				resourceType: "organization",
				resourceId: input.organizationId,
				resourceName: org.name,
			});
			return result;
		}),
	inviteMember: withPermission("member", "create")
		.meta({
			openapi: {
				summary: "Invite a member to organization",
				description: "Create a pending invitation for a user by email to join the active organization with the specified role. Checks for existing membership and pending invitations. Supports custom roles.",
			},
		})
		.input(
			z.object({
				email: z.string().email(),
				role: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const email = input.email.toLowerCase();

			// Check if user is already a member
			const existingUser = await db.query.user.findFirst({
				where: eq(user.email, email),
			});

			if (existingUser) {
				const existingMember = await db.query.member.findFirst({
					where: and(
						eq(member.organizationId, orgId),
						eq(member.userId, existingUser.id),
					),
				});

				if (existingMember) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "User is already a member of this organization",
					});
				}
			}

			// Check for pending invitation
			const existingInvitation = await db.query.invitation.findFirst({
				where: and(
					eq(invitation.organizationId, orgId),
					eq(invitation.email, email),
					eq(invitation.status, "pending"),
				),
			});

			if (existingInvitation) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "An invitation has already been sent to this email",
				});
			}

			// If assigning a custom role, verify it exists
			if (!["owner", "admin", "member"].includes(input.role)) {
				const customRole = await db.query.organizationRole.findFirst({
					where: and(
						eq(organizationRole.organizationId, orgId),
						eq(organizationRole.role, input.role),
					),
				});

				if (!customRole) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Role "${input.role}" not found`,
					});
				}
			}

			const [created] = await db
				.insert(invitation)
				.values({
					id: nanoid(),
					organizationId: orgId,
					email,
					role: input.role as any,
					status: "pending",
					expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
					inviterId: ctx.user.id,
				})
				.returning();

			await audit(ctx, {
				action: "create",
				resourceType: "organization",
				resourceId: created?.id,
				resourceName: email,
				metadata: { type: "inviteMember", role: input.role },
			});
			return created;
		}),

	allInvitations: withPermission("member", "create")
		.meta({
			openapi: {
				summary: "List all organization invitations",
				description: "Retrieve all invitations for the active organization, ordered by status and expiration date.",
			},
		})
		.query(async ({ ctx }) => {
		return await db.query.invitation.findMany({
			where: eq(invitation.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(invitation.status), desc(invitation.expiresAt)],
		});
	}),
	removeInvitation: withPermission("member", "create")
		.meta({
			openapi: {
				summary: "Remove an invitation",
				description: "Delete a pending invitation by ID. Only invitations belonging to the active organization can be removed.",
			},
		})
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

			const result = await db
				.delete(invitation)
				.where(eq(invitation.id, input.invitationId));
			await audit(ctx, {
				action: "delete",
				resourceType: "organization",
				resourceId: input.invitationId,
				resourceName: invitationResult.email,
				metadata: { type: "removeInvitation" },
			});
			return result;
		}),
	updateMemberRole: withPermission("member", "update")
		.meta({
			openapi: {
				summary: "Update member role",
				description: "Change the role of a member in the active organization. Users cannot change their own role, and the owner role is nontransferable. Only owners can change admin roles. Supports custom roles.",
			},
		})
		.input(
			z.object({
				memberId: z.string(),
				role: z.string().min(1),
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

			// Owner role is nontransferable - cannot change to or from owner
			if (target.role === "owner" || input.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "The owner role is nontransferable",
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

			// If assigning a custom role (not admin/member), verify it exists
			if (input.role !== "admin" && input.role !== "member") {
				const customRole = await db.query.organizationRole.findFirst({
					where: and(
						eq(
							organizationRole.organizationId,
							ctx.session.activeOrganizationId,
						),
						eq(organizationRole.role, input.role),
					),
				});

				if (!customRole) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Custom role "${input.role}" not found`,
					});
				}
			}

			// Update the target member's role
			await db
				.update(member)
				.set({ role: input.role })
				.where(eq(member.id, input.memberId));

			await audit(ctx, {
				action: "update",
				resourceType: "user",
				resourceId: target.userId,
				resourceName: target.user.email,
				metadata: { before: target.role, after: input.role },
			});
			return true;
		}),
	setDefault: protectedProcedure
		.meta({
			openapi: {
				summary: "Set default organization",
				description: "Set an organization as the default for the current user. Unsets any previous default and marks the specified organization as the new default.",
			},
		})
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

			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: input.organizationId,
				metadata: { type: "setDefault" },
			});
			return { success: true };
		}),
	active: protectedProcedure
		.meta({
			openapi: {
				summary: "Get active organization",
				description: "Retrieve the organization that is currently active in the user's session. Returns null if no organization is active.",
			},
		})
		.query(async ({ ctx }) => {
		if (!ctx.session.activeOrganizationId) {
			return null;
		}

		return await db.query.organization.findFirst({
			where: eq(organization.id, ctx.session.activeOrganizationId),
		});
	}),
});
