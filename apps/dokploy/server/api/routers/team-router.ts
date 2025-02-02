import { lucia } from "@dokploy/server";
import {
	auth,
	teamInvitations,
	teamMembers,
	teams,
	users,
} from "@dokploy/server/db/schema";
import {
	type Team,
	teamMemberSchema,
	teamSchema,
} from "@dokploy/server/db/schema";
import { getDefaultPermissionsByRole } from "@dokploy/server/services/team";
import {
	createTeamInvitation,
	generateTeamInvitation,
	revokeTeamInvitation,
	validateInvitationToken,
} from "@dokploy/server/services/team";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const memberPermissionsSchema = z.object({
	teamId: z.string(),
	userId: z.string(),
	// Team Member Permissions
	canManageTeam: z.boolean().optional().default(false),
	canInviteMembers: z.boolean().optional().default(false),
	canRemoveMembers: z.boolean().optional().default(false),
	canEditTeamSettings: z.boolean().optional().default(false),
	canViewTeamResources: z.boolean().optional().default(false),
	canManageTeamResources: z.boolean().optional().default(false),
	// User Permissions
	canCreateProjects: z.boolean().optional().default(false),
	canCreateServices: z.boolean().optional().default(false),
	canDeleteProjects: z.boolean().optional().default(false),
	canDeleteServices: z.boolean().optional().default(false),
	canAccessToTraefikFiles: z.boolean().optional().default(false),
	canAccessToDocker: z.boolean().optional().default(false),
	canAccessToAPI: z.boolean().optional().default(false),
	canAccessToSSHKeys: z.boolean().optional().default(false),
	canAccessToGitProviders: z.boolean().optional().default(false),
	accesedProjects: z.array(z.string()).optional(),
	accesedServices: z.array(z.string()).optional(),
});

export const teamRouter = createTRPCRouter({
	users: createTRPCRouter({
		all: protectedProcedure.query(async ({ ctx }) => {
			return await ctx.db.query.users.findMany({
				with: { auth: true },
			});
		}),

		byAuthId: publicProcedure
			.input(z.object({ authId: z.string() }))
			.query(async ({ ctx, input }) => {
				return await ctx.db.query.users.findFirst({
					where: eq(users.authId, input.authId),
				});
			}),

		delete: protectedProcedure
			.input(z.object({ userId: z.string() }))
			.mutation(async ({ ctx, input }) => {
				// First check if the user exists in team members
				const member = await ctx.db
					.select({
						userId: teamMembers.userId,
						authId: users.authId,
					})
					.from(teamMembers)
					.leftJoin(users, eq(teamMembers.userId, users.userId))
					.where(eq(teamMembers.userId, input.userId))
					.limit(1);

				if (!member.length) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User not found",
					});
				}

				const authId = member[0]!.authId;

				// Delete user's team memberships
				await ctx.db
					.delete(teamMembers)
					.where(eq(teamMembers.userId, input.userId));

				// Delete user record
				await ctx.db.delete(users).where(eq(users.userId, input.userId));

				if (authId) {
					await ctx.db.delete(auth).where(eq(auth.id, authId));
				}

				return { success: true };
			}),
	}),

	teamUsers: createTRPCRouter({
		createTeamUser: publicProcedure
			.input(
				z.object({
					email: z.string().email(),
					password: z.string(),
					invitationToken: z.string(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const invitation = await ctx.db.query.teamInvitations.findFirst({
						where: eq(teamInvitations.token, input.invitationToken),
						with: {
							team: true,
						},
					});

					if (!invitation || invitation.status !== "PENDING") {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Invalid or expired invitation",
						});
					}

					// Check if email already exists
					const existingAuth = await ctx.db.query.auth.findFirst({
						where: eq(auth.email, input.email.toLowerCase()),
					});

					let userId: string;
					let isNewUser = false;

					if (existingAuth) {
						// Check if user is already a member of this team
						const existingMember = await ctx.db
							.select()
							.from(teamMembers)
							.where(
								and(
									eq(teamMembers.teamId, invitation.teamId),
									eq(teamMembers.userId, existingAuth.id),
								),
							)
							.limit(1);

						if (existingMember.length > 0) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "You are already a member of this team",
							});
						}

						userId = existingAuth.id;
					} else {
						// Create new auth record if user doesn't exist
						const hashedPassword = await bcrypt.hash(input.password, 10);
						const [teamAuth] = await ctx.db
							.insert(auth)
							.values({
								email: input.email.toLowerCase(),
								password: hashedPassword,
								rol: "user",
								createdAt: new Date().toISOString(),
							})
							.returning();

						if (!teamAuth) {
							throw new TRPCError({
								code: "INTERNAL_SERVER_ERROR",
								message: "Failed to create user",
							});
						}

						userId = teamAuth.id;
						isNewUser = true;
					}

					// Add user to team with role-based permissions
					const defaultPermissions = getDefaultPermissionsByRole(
						invitation.role,
					);

					await ctx.db.insert(teamMembers).values({
						teamId: invitation.teamId,
						userId: userId,
						role: invitation.role,
						...defaultPermissions,
					});

					// Update invitation status
					await ctx.db
						.update(teamInvitations)
						.set({ status: "ACCEPTED" })
						.where(eq(teamInvitations.id, invitation.id));

					// Create session
					const session = await lucia.createSession(userId, {});
					const sessionCookie = lucia.createSessionCookie(session.id);

					// Set the cookie in the response
					ctx.res.appendHeader("Set-Cookie", sessionCookie.serialize());

					// Verify session was created
					const verifySession = await lucia.validateSession(session.id);
					if (!verifySession) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create session",
						});
					}

					return {
						success: true,
						isNewUser,
						sessionId: session.id,
					};
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to create team user",
					});
				}
			}),
	}),

	invitations: createTRPCRouter({
		inviteMember: protectedProcedure
			.input(
				z.object({
					teamId: z.string(),
					email: z.string().email(),
					role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				await createTeamInvitation(input.teamId, input.email, input.role);
				return { success: true };
			}),

		revokeInvitation: protectedProcedure
			.input(
				z.object({
					invitationId: z.string(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				await revokeTeamInvitation(input.invitationId);
				return { success: true };
			}),

		listByTeam: protectedProcedure
			.input(
				z.object({
					teamId: z.string(),
				}),
			)
			.query(async ({ ctx, input }) => {
				const invitations = await ctx.db
					.select({
						id: teamInvitations.id,
						teamId: teamInvitations.teamId,
						email: teamInvitations.email,
						role: teamInvitations.role,
						status: teamInvitations.status,
						type: teamInvitations.type,
						token: teamInvitations.token,
						inviteLink: teamInvitations.inviteLink,
						expiresAt: teamInvitations.expiresAt,
						createdAt: teamInvitations.createdAt,
					})
					.from(teamInvitations)
					.where(eq(teamInvitations.teamId, input.teamId))
					.orderBy(desc(teamInvitations.createdAt));

				return invitations;
			}),

		validateToken: publicProcedure
			.input(
				z.object({
					token: z.string(),
				}),
			)
			.query(async ({ ctx, input }) => {
				return await validateInvitationToken(input.token);
			}),

		generateInvite: protectedProcedure
			.input(
				z.object({
					teamId: z.string(),
					expirationDate: z.date(),
					role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				return await generateTeamInvitation(
					input.teamId,
					input.expirationDate,
					input.role,
				);
			}),
	}),

	all: protectedProcedure.query(async ({ ctx }) => {
		// First, get all teams where the user is a member
		const memberTeams = await ctx.db
			.select({
				teamId: teamMembers.teamId,
				role: teamMembers.role,
			})
			.from(teamMembers)
			.where(eq(teamMembers.userId, ctx.user.id));

		if (!memberTeams.length) return [];

		const teamIds = memberTeams.map((team) => team.teamId);

		// Get actual member counts
		const memberCounts = await ctx.db
			.select({
				teamId: teamMembers.teamId,
				count: sql<number>`count(distinct ${teamMembers.userId})::int`,
			})
			.from(teamMembers)
			.where(inArray(teamMembers.teamId, teamIds))
			.groupBy(teamMembers.teamId);

		const result = await ctx.db
			.select({
				teamId: teams.id,
				name: teams.name,
				description: teams.description,
				createdAt: teams.createdAt,
				updatedAt: teams.updatedAt,
			})
			.from(teams)
			.where(inArray(teams.id, teamIds));

		return result.map((team) => ({
			...team,
			_count: {
				members:
					memberCounts.find((mc) => mc.teamId === team.teamId)?.count || 1,
			},
			role: memberTeams.find((mt) => mt.teamId === team.teamId)?.role,
		}));
	}),

	byId: protectedProcedure
		.input(z.object({ teamId: z.string() }))
		.query(async ({ ctx, input }) => {
			const team = await ctx.db
				.select()
				.from(teams)
				.where(eq(teams.id, input.teamId))
				.limit(1);

			if (!team.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Team not found",
				});
			}

			// Get all members including their auth info
			const members = await ctx.db
				.select({
					userId: teamMembers.userId,
					role: teamMembers.role,
					user: {
						userId: auth.id,
						email: auth.email,
						name: auth.email,
						isRegistered: sql<boolean>`true`,
						is2FAEnabled: sql<boolean>`COALESCE(${auth.is2FAEnabled}, false)`,
						auth: sql<{ is2FAEnabled: boolean }>`jsonb_build_object(
							'is2FAEnabled', COALESCE(${auth.is2FAEnabled}, false)
						)`,
					},
				})
				.from(teamMembers)
				.innerJoin(auth, eq(teamMembers.userId, auth.id))
				.where(eq(teamMembers.teamId, input.teamId));

			// Filter out any members with null user data
			const validMembers = members.filter((member) => member.user?.email);
			const owner = validMembers.find((member) => member.role === "OWNER");
			const otherMembers = validMembers.filter(
				(member) => member.role !== "OWNER",
			);

			return {
				...team[0],
				members: owner ? [owner, ...otherMembers] : otherMembers,
			} as unknown as Team;
		}),

	removeMember: protectedProcedure
		.input(z.object({ teamId: z.string(), userId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const member = await ctx.db
				.select()
				.from(teamMembers)
				.where(
					and(
						eq(teamMembers.teamId, input.teamId),
						eq(teamMembers.userId, input.userId),
					),
				)
				.limit(1);

			if (member[0]?.role === "OWNER") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Cannot remove team owner",
				});
			}

			await ctx.db
				.delete(teamMembers)
				.where(
					and(
						eq(teamMembers.teamId, input.teamId),
						eq(teamMembers.userId, input.userId),
					),
				);
			return true;
		}),

	updateMember: protectedProcedure
		.input(teamMemberSchema)
		.mutation(async ({ ctx, input }) => {
			const userTeamRole = await ctx.db
				.select()
				.from(teamMembers)
				.where(
					and(
						eq(teamMembers.teamId, input.teamId as string),
						eq(teamMembers.userId, ctx.user.id),
					),
				)
				.limit(1);

			const role = userTeamRole[0]?.role;
			if (!role || (role !== "ADMIN" && role !== "OWNER")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Only team admins and owners can update member roles",
				});
			}

			const defaultPermissions = getDefaultPermissionsByRole(input.role);

			const [member] = await ctx.db
				.update(teamMembers)
				.set({
					role: input.role,
					...defaultPermissions,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(teamMembers.teamId, input.teamId as string),
						eq(teamMembers.userId, input.userId),
					),
				)
				.returning();
			return member;
		}),

	getMemberPermissions: protectedProcedure
		.input(z.object({ teamId: z.string(), userId: z.string() }))
		.query(async ({ ctx, input }) => {
			const member = await ctx.db
				.select({
					userId: teamMembers.userId,
					role: teamMembers.role,
					canManageTeam: teamMembers.canManageTeam,
					canInviteMembers: teamMembers.canInviteMembers,
					canRemoveMembers: teamMembers.canRemoveMembers,
					canEditTeamSettings: teamMembers.canEditTeamSettings,
					canViewTeamResources: teamMembers.canViewTeamResources,
					canManageTeamResources: teamMembers.canManageTeamResources,
					canCreateProjects: teamMembers.canCreateProjects,
					canCreateServices: teamMembers.canCreateServices,
					canDeleteProjects: teamMembers.canDeleteProjects,
					canDeleteServices: teamMembers.canDeleteServices,
					canAccessToTraefikFiles: teamMembers.canAccessToTraefikFiles,
					canAccessToDocker: teamMembers.canAccessToDocker,
					canAccessToAPI: teamMembers.canAccessToAPI,
					canAccessToSSHKeys: teamMembers.canAccessToSSHKeys,
					canAccessToGitProviders: teamMembers.canAccessToGitProviders,
					accesedProjects: teamMembers.accesedProjects,
					accesedServices: teamMembers.accesedServices,
				})
				.from(teamMembers)
				.where(
					and(
						eq(teamMembers.teamId, input.teamId),
						eq(teamMembers.userId, input.userId),
					),
				)
				.limit(1);

			if (!member.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Team member not found",
				});
			}

			return member[0];
		}),

	updateMemberPermissions: protectedProcedure
		.input(memberPermissionsSchema)
		.mutation(async ({ ctx, input }) => {
			const [member] = await ctx.db
				.update(teamMembers)
				.set({
					...input,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(teamMembers.teamId, input.teamId),
						eq(teamMembers.userId, input.userId),
					),
				)
				.returning();

			return member;
		}),

	delete: protectedProcedure
		.input(z.object({ teamId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(teams).where(eq(teams.id, input.teamId));
			return true;
		}),

	update: protectedProcedure
		.input(
			z.object({
				teamId: z.string(),
				name: z.string(),
				description: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const team = await ctx.db
				.update(teams)
				.set({
					name: input.name,
					description: input.description,
					updatedAt: new Date(),
				})
				.where(eq(teams.id, input.teamId))
				.returning();
			return team;
		}),

	create: protectedProcedure
		.input(teamSchema.pick({ name: true, description: true }))
		.mutation(async ({ ctx, input }) => {
			// Create the team
			const [team] = await ctx.db
				.insert(teams)
				.values({
					name: input.name,
					description: input.description,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.returning();

			if (!team) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create team",
				});
			}

			// Add creator as owner with default permissions
			await ctx.db.insert(teamMembers).values({
				teamId: team.id,
				userId: ctx.user.id,
				role: "OWNER",
				...getDefaultPermissionsByRole("OWNER"),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			return team;
		}),

	addUserToTeam: protectedProcedure
		.input(
			z.object({
				teamId: z.string(),
				userId: z.string(),
				role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Debug log to check input
			console.log("Adding user:", {
				userId: input.userId,
				teamId: input.teamId,
			});

			// First check if the user exists in auth table
			const userAuth = await ctx.db
				.select({
					id: auth.id,
					email: auth.email,
				})
				.from(auth)
				.where(eq(auth.id, input.userId))
				.limit(1);

			console.log("Found user:", userAuth[0]); // Debug log

			if (!userAuth.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `User with ID ${input.userId} not found in auth table`,
				});
			}

			// Check if user is already a member
			const existingMember = await ctx.db
				.select({
					userId: teamMembers.userId,
					role: teamMembers.role,
					user: {
						userId: auth.id,
						email: auth.email,
						name: auth.email,
						isRegistered: sql<boolean>`true`,
						is2FAEnabled: sql<boolean>`COALESCE(${auth.is2FAEnabled}, false)`,
						auth: sql<{ is2FAEnabled: boolean }>`jsonb_build_object(
							'is2FAEnabled', COALESCE(${auth.is2FAEnabled}, false)
						)`,
					},
				})
				.from(teamMembers)
				.innerJoin(auth, eq(teamMembers.userId, auth.id))
				.where(
					and(
						eq(teamMembers.teamId, input.teamId),
						eq(teamMembers.userId, input.userId),
					),
				)
				.limit(1);

			if (existingMember.length > 0) {
				return {
					success: true,
					message: "User is already a member of this team",
					alreadyMember: true,
					member: existingMember[0],
				};
			}

			// Add user to team with role-based permissions
			const defaultPermissions = getDefaultPermissionsByRole(input.role);

			// Insert the team member
			await ctx.db.insert(teamMembers).values({
				teamId: input.teamId,
				userId: input.userId,
				role: input.role,
				...defaultPermissions,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			// Return the complete member info
			const [newMember] = await ctx.db
				.select({
					userId: teamMembers.userId,
					role: teamMembers.role,
					user: {
						userId: auth.id,
						email: auth.email,
						name: auth.email,
						isRegistered: sql<boolean>`true`,
						is2FAEnabled: sql<boolean>`COALESCE(${auth.is2FAEnabled}, false)`,
						auth: sql<{ is2FAEnabled: boolean }>`jsonb_build_object(
							'is2FAEnabled', COALESCE(${auth.is2FAEnabled}, false)
						)`,
					},
				})
				.from(teamMembers)
				.innerJoin(auth, eq(teamMembers.userId, auth.id))
				.where(
					and(
						eq(teamMembers.teamId, input.teamId),
						eq(teamMembers.userId, input.userId),
					),
				);

			return {
				success: true,
				message: "User added to team successfully",
				member: newMember,
			};
		}),
});
