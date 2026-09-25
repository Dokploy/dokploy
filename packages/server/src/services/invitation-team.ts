import { db } from "@dokploy/server/db";
import { invitation, member, team } from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";
import { validateTeamCapacity } from "./organization-teams";

export const assignAcceptedInvitationTeam = async (
	invitationId: string,
	memberId: string,
) => {
	const acceptedInvitation = await db.query.invitation.findFirst({
		where: eq(invitation.id, invitationId),
		columns: { organizationId: true, teamId: true },
	});
	if (!acceptedInvitation?.teamId) return;
	const invitedTeam = await db.query.team.findFirst({
		where: and(
			eq(team.id, acceptedInvitation.teamId),
			eq(team.organizationId, acceptedInvitation.organizationId),
		),
		columns: { id: true, maxMembers: true },
	});
	if (!invitedTeam) return;

	// Re-check capacity when the invitation is accepted. The earlier invite-time
	// check is only advisory: members may have been moved into the team while
	// this invitation was pending.
	const assigned = await db.query.member.findMany({
		where: and(
			eq(member.organizationId, acceptedInvitation.organizationId),
			eq(member.teamId, invitedTeam.id),
		),
		columns: { id: true },
	});
	const alreadyAssigned = assigned.some((entry) => entry.id === memberId);
	if (!alreadyAssigned) {
		validateTeamCapacity(assigned.length, invitedTeam.maxMembers, 1);
	}

	await db
		.update(member)
		.set({ teamId: invitedTeam.id })
		.where(
			and(
				eq(member.id, memberId),
				eq(member.organizationId, acceptedInvitation.organizationId),
			),
		);
};
