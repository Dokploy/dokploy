import { randomBytes } from "node:crypto";
import { db } from "@dokploy/server/db";
import {
	teamInvitations,
	teamMembers,
	teams,
} from "@dokploy/server/db/schema/team-schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { TeamRole } from "../db/schema/team-schema";
import { getDokployUrl } from "./admin";

// Add the generate Readable Token
function generateReadableToken(): string {
	const adjectives = [
		"swift",
		"bright",
		"cosmic",
		"noble",
		"golden",
		"crystal",
		"silver",
		"royal",
		"azure",
		"mystic",
		"brave",
		"grand",
		"stellar",
		"radiant",
		"mighty",
		"gentle",
		"clever",
		"vivid",
		"proud",
		"peaceful",
	];

	const nouns = [
		"phoenix",
		"dragon",
		"falcon",
		"tiger",
		"eagle",
		"wolf",
		"lion",
		"hawk",
		"bear",
		"dolphin",
		"panther",
		"raven",
		"griffin",
		"whale",
		"jaguar",
		"leopard",
		"cobra",
		"viper",
		"shark",
		"owl",
	];

	const numbers = Math.floor(1000000 + Math.random() * 9000000);

	const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];

	return `${adjective}-${noun}-${numbers}`;
}

// Team Permissions
export const getDefaultPermissionsByRole = (role: TeamRole) => {
	switch (role) {
		case "OWNER":
		case "ADMIN":
			return {
				canManageTeam: true,
				canInviteMembers: true,
				canRemoveMembers: true,
				canEditTeamSettings: true,
				canViewTeamResources: true,
				canManageTeamResources: true,
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: true,
				canDeleteServices: true,
				canAccessToTraefikFiles: true,
				canAccessToDocker: true,
				canAccessToAPI: true,
				canAccessToSSHKeys: true,
				canAccessToGitProviders: true,
				accesedProjects: [],
				accesedServices: [],
			};
		case "MEMBER":
			return {
				canManageTeam: false,
				canInviteMembers: false,
				canRemoveMembers: false,
				canEditTeamSettings: false,
				canViewTeamResources: false,
				canManageTeamResources: false,
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: true,
				canDeleteServices: true,
				canAccessToTraefikFiles: false,
				canAccessToDocker: false,
				canAccessToAPI: false,
				canAccessToSSHKeys: false,
				canAccessToGitProviders: false,
				accesedProjects: [],
				accesedServices: [],
			};
		case "GUEST":
			return {
				canManageTeam: false,
				canInviteMembers: false,
				canRemoveMembers: false,
				canEditTeamSettings: false,
				canViewTeamResources: false,
				canManageTeamResources: false,
				canCreateProjects: false,
				canCreateServices: false,
				canDeleteProjects: false,
				canDeleteServices: false,
				canAccessToTraefikFiles: false,
				canAccessToDocker: false,
				canAccessToAPI: false,
				canAccessToSSHKeys: false,
				canAccessToGitProviders: false,
				accesedProjects: [],
				accesedServices: [],
			};
	}
};

export const isTeamAdmin = (role: TeamRole) => {
	return role === "OWNER" || role === "ADMIN";
};

export const canManageTeamMembers = (role: TeamRole) => {
	return isTeamAdmin(role);
};

// Team Invitations
export const createTeamInvitation = async (
	teamId: string,
	email: string,
	role: string,
) => {
	const token = randomBytes(32).toString("hex");
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 1);

	const baseUrl = await getDokployUrl();

	// First get the team details
	const team = await db.query.teams.findFirst({
		where: eq(teams.id, teamId),
	});

	if (!team) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Team not found",
		});
	}

	const [invitation] = await db
		.insert(teamInvitations)
		.values({
			teamId,
			email: email.toLowerCase(),
			role: role as "ADMIN" | "MEMBER" | "GUEST",
			token,
			type: "EMAIL",
			inviteLink: `${baseUrl}/team-invitation?token=${token}`,
			expiresAt,
		})
		.returning();

	if (!invitation) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to create team invitation",
		});
	}

	// Send invitation email with actual team name
	await sendTeamInvitationEmail({
		email: invitation.email!,
		inviteLink: invitation.inviteLink,
		teamName: team.name,
	});

	return invitation;
};

export const revokeTeamInvitation = async (invitationId: string) => {
	try {
		const [deleted] = await db
			.delete(teamInvitations)
			.where(eq(teamInvitations.id, invitationId))
			.returning();

		if (!deleted) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Invitation not found",
			});
		}

		return { success: true };
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to revoke invitation",
		});
	}
};

export const validateInvitationToken = async (token: string) => {
	const invitation = await db.query.teamInvitations.findFirst({
		where: (invitations, { eq }) => eq(invitations.token, token),
		with: {
			team: true,
		},
	});

	if (!invitation) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Invitation not found",
		});
	}

	if (invitation.status !== "PENDING") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This invitation has already been used or has expired",
		});
	}

	if (new Date() > invitation.expiresAt) {
		await db
			.update(teamInvitations)
			.set({ status: "EXPIRED" })
			.where(eq(teamInvitations.id, invitation.id));

		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This invitation has expired",
		});
	}

	return {
		teamName: invitation.team.name,
		teamDescription: invitation.team.description,
		role: invitation.role,
		type: invitation.type,
	};
};

export const acceptTeamInvitation = async (token: string, userId: string) => {
	const invitation = await db.query.teamInvitations.findFirst({
		where: (invitations, { eq }) => eq(invitations.token, token),
	});

	if (!invitation) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Invitation not found",
		});
	}

	if (invitation.status !== "PENDING") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This invitation has already been used or has expired",
		});
	}

	if (new Date() > invitation.expiresAt) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This invitation has expired",
		});
	}

	// Start a transaction to ensure data consistency
	return await db.transaction(async (tx) => {
		// Update invitation status
		await tx
			.update(teamInvitations)
			.set({ status: "ACCEPTED" })
			.where(eq(teamInvitations.id, invitation.id));

		// Get default permissions for the role
		const defaultPermissions = getDefaultPermissionsByRole(invitation.role);

		// Add user to team with proper permissions
		const [teamMember] = await tx
			.insert(teamMembers)
			.values({
				teamId: invitation.teamId,
				userId,
				role: invitation.role,
				...defaultPermissions,
			})
			.returning();

		return teamMember;
	});
};

export const generateTeamInvitation = async (
	teamId: string,
	expirationDate: Date,
	role: "ADMIN" | "MEMBER" | "GUEST",
	allowMultipleUses = false,
	usageLimit: number | null = null,
) => {
	const token = generateReadableToken();
	const baseUrl = await getDokployUrl();

	const [invitation] = await db
		.insert(teamInvitations)
		.values({
			teamId,
			role,
			token,
			type: "LINK",
			inviteLink: `${baseUrl}/team-invitation?token=${token}`,
			expiresAt: expirationDate,
			status: "PENDING",
		})
		.returning();

	if (!invitation) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to create team invitation",
		});
	}

	return {
		id: invitation.id,
		token: invitation.token,
		inviteLink: invitation.inviteLink,
	};
};

async function sendTeamInvitationEmail({
	email,
	inviteLink,
	teamName,
}: {
	email: string;
	inviteLink: string;
	teamName: string;
}) {
	console.log(`Sending invitation email to ${email} for team ${teamName}`);
	console.log(`Invitation link: ${inviteLink}`);
}
