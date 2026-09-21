import { db } from "@dokploy/server/db";
import {
	hasValidLicense,
	IS_CLOUD,
	sendInvitationEmail,
} from "@dokploy/server/index";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, exists, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	assertMemberLimit,
	assertOrganizationLimit,
} from "@/server/api/utils/plan-limits";
import {
	invitation,
	member,
	organization,
	organizationRole,
	team,
	teamMember,
	user,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";
export const organizationRouter = createTRPCRouter({
	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				logo: z.string().optional(),
				description: z.string().max(500).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin" && !IS_CLOUD) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the organization owner can create an organization",
				});
			}

			if (IS_CLOUD) {
				await assertOrganizationLimit(ctx.user.id);
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
		.input(
			z.object({
				organizationId: z.string(),
				name: z.string().min(1),
				logo: z.string().optional(),
				description: z.string().max(500).nullable().optional(),
				defaultRole: z.string().min(1).nullable().optional(),
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

			if (input.defaultRole !== undefined && input.defaultRole !== null) {
				if (input.defaultRole === "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Cannot set owner as the default role",
					});
				}

				if (!["admin", "member", "viewer"].includes(input.defaultRole)) {
					const customRole = await db.query.organizationRole.findFirst({
						where: and(
							eq(organizationRole.organizationId, input.organizationId),
							eq(organizationRole.role, input.defaultRole),
						),
					});

					if (!customRole) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: `Role "${input.defaultRole}" not found`,
						});
					}

					if (!(await hasValidLicense(input.organizationId))) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message:
								"Setting a custom role as default requires a valid enterprise license",
						});
					}
				}
			}

			const result = await db
				.update(organization)
				.set({
					name: input.name,
					logo: input.logo,
					...(input.description !== undefined && {
						description: input.description,
					}),
					...(input.defaultRole !== undefined && {
						defaultRole: input.defaultRole,
					}),
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
		.input(
			z.object({
				email: z.string().email(),
				role: z.string().min(1),
				teamId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const email = input.email.toLowerCase();

			if (input.teamId) {
				const targetTeam = await db.query.team.findFirst({
					where: and(
						eq(team.id, input.teamId),
						eq(team.organizationId, orgId),
					),
				});
				if (!targetTeam) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Team not found in this organization",
					});
				}
				if (targetTeam.memberCount >= targetTeam.maxMembers) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Team member limit reached",
					});
				}
			}

			if (IS_CLOUD) {
				await assertMemberLimit(orgId);
			}

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

			// Owner role is non-delegable — no one can invite as owner
			if (input.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Cannot invite a user with the owner role",
				});
			}

			// If assigning a custom role, verify it exists
			if (!["owner", "admin", "member", "viewer"].includes(input.role)) {
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
					teamId: input.teamId,
				})
				.returning();

			if (IS_CLOUD && created) {
				const host =
					process.env.NODE_ENV === "development"
						? "http://localhost:3000"
						: "https://app.dokploy.com";
				const inviteLink = `${host}/invitation?token=${created.id}`;

				const org = await db.query.organization.findFirst({
					where: eq(organization.id, orgId),
				});

				await sendInvitationEmail({
					email,
					inviteLink,
					organizationName: org?.name || "organization",
				});
			}

			await audit(ctx, {
				action: "create",
				resourceType: "organization",
				resourceId: created?.id,
				resourceName: email,
				metadata: { type: "inviteMember", role: input.role },
			});
			return created;
		}),


	teams: withPermission("member", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		return await db.query.team.findMany({
			where: eq(team.organizationId, orgId),
			with: {
				members: true,
			},
			orderBy: [desc(team.createdAt)],
		});
	}),
	createTeam: withPermission("team", "create")
		.input(
			z.object({
				name: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				maxMembers: z.number().int().min(1).max(500).default(50),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const existing = await db.query.team.findFirst({
				where: and(
					eq(team.organizationId, orgId),
					eq(team.name, input.name),
				),
			});
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "A team with this name already exists",
				});
			}
			const [created] = await db
				.insert(team)
				.values({
					name: input.name,
					description: input.description,
					maxMembers: input.maxMembers,
					organizationId: orgId,
				})
				.returning();
			await audit(ctx, {
				action: "create",
				resourceType: "organization",
				resourceId: created?.id,
				resourceName: input.name,
				metadata: { type: "team" },
			});
			return created;
		}),
	updateTeam: withPermission("team", "update")
		.input(
			z.object({
				teamId: z.string().min(1),
				name: z.string().min(1).max(100).optional(),
				description: z.string().max(500).nullable().optional(),
				maxMembers: z.number().int().min(1).max(500).optional(),
				accessedProjects: z.array(z.string()).optional(),
				accessedEnvironments: z.array(z.string()).optional(),
				accessedServices: z.array(z.string()).optional(),
				accessedGitProviders: z.array(z.string()).optional(),
				accessedServers: z.array(z.string()).optional(),
				canCreateProjects: z.boolean().optional(),
				canAccessToSSHKeys: z.boolean().optional(),
				canCreateServices: z.boolean().optional(),
				canDeleteProjects: z.boolean().optional(),
				canDeleteServices: z.boolean().optional(),
				canAccessToDocker: z.boolean().optional(),
				canAccessToAPI: z.boolean().optional(),
				canAccessToGitProviders: z.boolean().optional(),
				canAccessToTraefikFiles: z.boolean().optional(),
				canDeleteEnvironments: z.boolean().optional(),
				canCreateEnvironments: z.boolean().optional(),
				canManageDeployments: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const existing = await db.query.team.findFirst({
				where: and(eq(team.id, input.teamId), eq(team.organizationId, orgId)),
			});
			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
			}
			if (
				input.maxMembers !== undefined &&
				input.maxMembers < existing.memberCount
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Team limit cannot be lower than its current member count",
				});
			}
			const { teamId, ...changes } = input;
			const [updated] = await db
				.update(team)
				.set(changes)
				.where(eq(team.id, teamId))
				.returning();
			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: teamId,
				resourceName: updated?.name,
				metadata: { type: "teamPermissions" },
			});
			return updated;
		}),
	deleteTeam: withPermission("team", "delete")
		.input(z.object({ teamId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const existing = await db.query.team.findFirst({
				where: and(eq(team.id, input.teamId), eq(team.organizationId, orgId)),
			});
			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
			}
			await db.transaction(async (tx) => {
				await tx
					.update(member)
					.set({ teamId: null })
					.where(eq(member.teamId, input.teamId));
				await tx.delete(team).where(eq(team.id, input.teamId));
			});
			await audit(ctx, {
				action: "delete",
				resourceType: "organization",
				resourceId: input.teamId,
				resourceName: existing.name,
				metadata: { type: "team" },
			});
			return true;
		}),
	moveMemberToTeam: withPermission("team", "update")
		.input(
			z.object({
				memberId: z.string().min(1),
				teamId: z.string().min(1).nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const targetMember = await db.query.member.findFirst({
				where: and(
					eq(member.id, input.memberId),
					eq(member.organizationId, orgId),
				),
			});
			if (!targetMember) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
			}

			let targetTeam: typeof team.$inferSelect | undefined;
			if (input.teamId) {
				targetTeam = await db.query.team.findFirst({
					where: and(eq(team.id, input.teamId), eq(team.organizationId, orgId)),
				});
				if (!targetTeam) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
				}
			}

			const currentMemberships = await db
				.select({ id: teamMember.id, teamId: teamMember.teamId })
				.from(teamMember)
				.innerJoin(team, eq(teamMember.teamId, team.id))
				.where(
					and(
						eq(teamMember.userId, targetMember.userId),
						eq(team.organizationId, orgId),
					),
				);

			await db.transaction(async (tx) => {
				for (const membership of currentMemberships) {
					await tx
						.delete(teamMember)
						.where(eq(teamMember.id, membership.id));
					await tx
						.update(team)
						.set({ memberCount: sql`GREATEST(${team.memberCount} - 1, 0)` })
						.where(eq(team.id, membership.teamId));
				}
				if (targetTeam) {
					const [reservedTeam] = await tx
						.update(team)
						.set({ memberCount: sql`${team.memberCount} + 1` })
						.where(
							and(
								eq(team.id, targetTeam.id),
								sql`${team.memberCount} < ${team.maxMembers}`,
							),
						)
						.returning({ id: team.id });

					if (!reservedTeam) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Team member limit reached",
						});
					}

					await tx.insert(teamMember).values({
						id: nanoid(),
						teamId: targetTeam.id,
						userId: targetMember.userId,
						membershipKey: `${targetTeam.id}:${targetMember.userId}`,
						createdAt: new Date(),
					});
				}
				await tx
					.update(member)
					.set({ teamId: targetTeam?.id ?? null })
					.where(eq(member.id, targetMember.id));
			});

			await audit(ctx, {
				action: "update",
				resourceType: "user",
				resourceId: targetMember.userId,
				metadata: {
					type: "moveMemberToTeam",
					teamId: targetTeam?.id ?? null,
				},
			});
			return true;
		}),

	allInvitations: withPermission("member", "create").query(async ({ ctx }) => {
		return await db.query.invitation.findMany({
			where: eq(invitation.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(invitation.status), desc(invitation.expiresAt)],
		});
	}),
	removeInvitation: withPermission("member", "create")
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

			// Ownership changes use the dedicated transferOwnership endpoint so
			// organization.ownerId and both membership roles update atomically.
			if (target.role === "owner" || input.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Use Transfer Ownership to change the owner",
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
			if (!["admin", "member", "viewer"].includes(input.role)) {
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

	transferOwnership: protectedProcedure
		.input(z.object({ memberId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const org = await db.query.organization.findFirst({
				where: eq(organization.id, orgId),
			});
			if (!org || org.ownerId !== ctx.user.id || ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the current organization owner can transfer ownership",
				});
			}
			const currentOwner = await db.query.user.findFirst({
				where: eq(user.id, ctx.user.id),
			});
			if (!currentOwner) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization owner not found",
				});
			}

			const hasOwnerBoundEntitlements =
				currentOwner.enablePaidFeatures ||
				currentOwner.isValidEnterpriseLicense ||
				currentOwner.licenseKey !== null ||
				currentOwner.stripeCustomerId !== null ||
				currentOwner.stripeSubscriptionId !== null ||
				currentOwner.serversQuantity > 0 ||
				currentOwner.isEnterpriseCloud;

			if (hasOwnerBoundEntitlements) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Transfer or deactivate the current owner's billing and enterprise entitlements before transferring organization ownership",
				});
			}

			const target = await db.query.member.findFirst({
				where: and(eq(member.id, input.memberId), eq(member.organizationId, orgId)),
				with: { user: true },
			});
			if (!target) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
			}
			if (target.userId === ctx.user.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This user already owns the organization",
				});
			}

			await db.transaction(async (tx) => {
				await tx
					.update(member)
					.set({ role: "admin" })
					.where(
						and(
							eq(member.userId, ctx.user.id),
							eq(member.organizationId, orgId),
						),
					);
				await tx
					.update(member)
					.set({ role: "owner" })
					.where(eq(member.id, target.id));
				await tx
					.update(organization)
					.set({ ownerId: target.userId })
					.where(eq(organization.id, orgId));
			});

			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: orgId,
				resourceName: org.name,
				metadata: {
					type: "transferOwnership",
					fromUserId: ctx.user.id,
					toUserId: target.userId,
				},
			});
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

			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: input.organizationId,
				metadata: { type: "setDefault" },
			});
			return { success: true };
		}),
	active: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.activeOrganizationId) {
			return null;
		}

		return await db.query.organization.findFirst({
			where: eq(organization.id, ctx.session.activeOrganizationId),
		});
	}),
});
