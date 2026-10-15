import { db } from "@dokploy/server/db";
import {
	deleteOrganization,
	hasValidLicense,
	IS_CLOUD,
	sendInvitationEmail,
} from "@dokploy/server/index";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, exists, inArray } from "drizzle-orm";
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
	user,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";
import {
	applyTeamMemberMove,
	createTeamSchema,
	deleteTeamSchema,
	filterStaleInvitationIds,
	moveTeamMemberSchema,
	type OrganizationMetadataEnvelope,
	parseOrganizationMetadata,
	readTeamsFromMetadata,
	type TeamMetadataItem,
	updateTeamSchema,
} from "./organization-teams";

const assertAdminOrOwnerMember = async (
	organizationId: string,
	userId: string,
) => {
	const org = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
	});

	if (!org) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Organization not found",
		});
	}

	const actorMember = await db.query.member.findFirst({
		where: and(
			eq(member.organizationId, organizationId),
			eq(member.userId, userId),
		),
	});

	if (!actorMember) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not a member of this organization",
		});
	}

	const isAuthorized =
		org.ownerId === userId ||
		actorMember.role === "owner" ||
		actorMember.role === "admin";

	if (!isAuthorized) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Only organization owners and admins can manage teams and invitations",
		});
	}

	return { org, actorMember };
};
export const organizationRouter = createTRPCRouter({
	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
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
				defaultRole: z.string().min(1).nullable().optional(),
				description: z.string().max(500).trim().nullable().optional(),
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

				if (!["admin", "member"].includes(input.defaultRole)) {
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

			const nextMetadata =
				input.description !== undefined
					? JSON.stringify({
							...parseOrganizationMetadata(org.metadata),
							description: input.description,
						})
					: undefined;

			const result = await db
				.update(organization)
				.set({
					name: input.name,
					logo: input.logo,
					...(input.defaultRole !== undefined && {
						defaultRole: input.defaultRole,
					}),
					...(nextMetadata !== undefined && {
						metadata: nextMetadata,
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

			const result = await deleteOrganization(input.organizationId);

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
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const email = input.email.toLowerCase();

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
	transferOwnership: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().min(1),
				targetMemberId: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const org = await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			const currentMember = await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, input.organizationId),
					eq(member.userId, ctx.user.id),
				),
			});

			if (!currentMember) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
				});
			}

			const isOwner =
				org.ownerId === ctx.user.id || currentMember.role === "owner";

			if (!isOwner) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the organization owner can transfer ownership",
				});
			}

			const targetMember = await db.query.member.findFirst({
				where: and(
					eq(member.id, input.targetMemberId),
					eq(member.organizationId, input.organizationId),
				),
				with: { user: true },
			});

			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Target member not found in this organization",
				});
			}

			if (targetMember.userId === ctx.user.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You are already the owner of this organization",
				});
			}

			await db.transaction(async (tx) => {
				await tx
					.update(organization)
					.set({ ownerId: targetMember.userId })
					.where(eq(organization.id, input.organizationId));

				await tx
					.update(member)
					.set({ role: "admin" })
					.where(
						and(
							eq(member.organizationId, input.organizationId),
							eq(member.role, "owner"),
						),
					);

				await tx
					.update(member)
					.set({ role: "owner" })
					.where(eq(member.id, targetMember.id));
			});

			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: input.organizationId,
				resourceName: org.name,
				metadata: {
					type: "transferOwnership",
					previousOwnerId: ctx.user.id,
					newOwnerId: targetMember.userId,
				},
			});

			return { success: true };
		}),
	cleanupExpiredInvitations: withPermission("member", "create").mutation(
		async ({ ctx }) => {
			const orgId = ctx.session.activeOrganizationId;
			const now = new Date();

			const allOrgInvitations = await db.query.invitation.findMany({
				where: eq(invitation.organizationId, orgId),
			});

			const staleIds = filterStaleInvitationIds(allOrgInvitations, now);

			if (staleIds.length === 0) {
				return { deletedCount: 0, deletedIds: [] };
			}

			await db
				.delete(invitation)
				.where(
					and(
						eq(invitation.organizationId, orgId),
						inArray(invitation.id, staleIds),
					),
				);

			await audit(ctx, {
				action: "delete",
				resourceType: "organization",
				resourceId: orgId,
				metadata: {
					type: "cleanupExpiredInvitations",
					deletedCount: staleIds.length,
				},
			});

			return { deletedCount: staleIds.length, deletedIds: staleIds };
		},
	),
	listTeams: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
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

			const org = await db.query.organization.findFirst({
				where: eq(organization.id, input.organizationId),
			});

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			const meta = parseOrganizationMetadata(org.metadata);
			return readTeamsFromMetadata(meta);
		}),
	createTeam: protectedProcedure
		.input(createTeamSchema)
		.mutation(async ({ ctx, input }) => {
			const { org } = await assertAdminOrOwnerMember(
				input.organizationId,
				ctx.user.id,
			);

			const meta = parseOrganizationMetadata(org.metadata);
			const teams = readTeamsFromMetadata(meta);

			const duplicate = teams.some(
				(team) => team.name.toLowerCase() === input.name.toLowerCase(),
			);
			if (duplicate) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `A team named "${input.name}" already exists`,
				});
			}

			const createdTeam: TeamMetadataItem = {
				id: nanoid(),
				name: input.name,
				description: input.description ?? null,
				maxSize: input.maxSize ?? null,
				memberIds: [],
			};

			const nextMeta: OrganizationMetadataEnvelope = {
				...meta,
				teams: [...teams, createdTeam],
			};

			await db
				.update(organization)
				.set({ metadata: JSON.stringify(nextMeta) })
				.where(eq(organization.id, input.organizationId));

			await audit(ctx, {
				action: "create",
				resourceType: "organization",
				resourceId: createdTeam.id,
				resourceName: createdTeam.name,
				metadata: {
					type: "createTeam",
					organizationId: input.organizationId,
					maxSize: createdTeam.maxSize,
				},
			});

			return createdTeam;
		}),
	updateTeam: protectedProcedure
		.input(updateTeamSchema)
		.mutation(async ({ ctx, input }) => {
			const { org } = await assertAdminOrOwnerMember(
				input.organizationId,
				ctx.user.id,
			);

			const meta = parseOrganizationMetadata(org.metadata);
			const teams = readTeamsFromMetadata(meta);
			const teamIndex = teams.findIndex((team) => team.id === input.teamId);
			const currentTeam = teamIndex !== -1 ? teams[teamIndex] : undefined;

			if (!currentTeam) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Team not found in this organization",
				});
			}

			if (
				input.maxSize !== undefined &&
				input.maxSize !== null &&
				currentTeam.memberIds.length > input.maxSize
			) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cannot set maxSize to ${input.maxSize} because the team currently has ${currentTeam.memberIds.length} members`,
				});
			}

			const updatedTeam: TeamMetadataItem = {
				...currentTeam,
				...(input.name !== undefined && { name: input.name }),
				...(input.description !== undefined && {
					description: input.description,
				}),
				...(input.maxSize !== undefined && { maxSize: input.maxSize }),
			};

			const nextTeams = [...teams];
			nextTeams[teamIndex] = updatedTeam;

			await db
				.update(organization)
				.set({
					metadata: JSON.stringify({
						...meta,
						teams: nextTeams,
					}),
				})
				.where(eq(organization.id, input.organizationId));

			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: updatedTeam.id,
				resourceName: updatedTeam.name,
				metadata: {
					type: "updateTeam",
					organizationId: input.organizationId,
				},
			});

			return updatedTeam;
		}),
	deleteTeam: protectedProcedure
		.input(deleteTeamSchema)
		.mutation(async ({ ctx, input }) => {
			const { org } = await assertAdminOrOwnerMember(
				input.organizationId,
				ctx.user.id,
			);

			const meta = parseOrganizationMetadata(org.metadata);
			const teams = readTeamsFromMetadata(meta);
			const targetTeam = teams.find((team) => team.id === input.teamId);

			if (!targetTeam) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Team not found in this organization",
				});
			}

			const nextTeams = teams.filter((team) => team.id !== input.teamId);

			await db
				.update(organization)
				.set({
					metadata: JSON.stringify({
						...meta,
						teams: nextTeams,
					}),
				})
				.where(eq(organization.id, input.organizationId));

			await audit(ctx, {
				action: "delete",
				resourceType: "organization",
				resourceId: targetTeam.id,
				resourceName: targetTeam.name,
				metadata: {
					type: "deleteTeam",
					organizationId: input.organizationId,
				},
			});

			return { success: true };
		}),
	moveTeamMember: protectedProcedure
		.input(moveTeamMemberSchema)
		.mutation(async ({ ctx, input }) => {
			const { org } = await assertAdminOrOwnerMember(
				input.organizationId,
				ctx.user.id,
			);

			const targetOrgMember = await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, input.organizationId),
					eq(member.userId, input.memberUserId),
				),
			});

			if (!targetOrgMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User is not a member of this organization",
				});
			}

			const meta = parseOrganizationMetadata(org.metadata);
			const teams = readTeamsFromMetadata(meta);

			const { sourceTeam, targetTeam, nextTeams } = applyTeamMemberMove(
				teams,
				input,
			);

			await db
				.update(organization)
				.set({
					metadata: JSON.stringify({
						...meta,
						teams: nextTeams,
					}),
				})
				.where(eq(organization.id, input.organizationId));

			await audit(ctx, {
				action: "update",
				resourceType: "organization",
				resourceId: input.organizationId,
				metadata: {
					type: "moveTeamMember",
					memberUserId: input.memberUserId,
					sourceTeamId: input.sourceTeamId,
					targetTeamId: input.targetTeamId,
				},
			});

			return {
				sourceTeam,
				targetTeam,
			};
		}),
});
