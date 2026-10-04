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

	await db.transaction(async (tx) => {
		const assigned = await tx.query.member.findMany({
			where: and(
				eq(member.organizationId, acceptedInvitation.organizationId),
				eq(member.teamId, invitedTeam.id),
			),
			columns: { id: true },
		});
		const pendingForTeam = await tx.query.invitation.findMany({
			where: and(
				eq(invitation.organizationId, acceptedInvitation.organizationId),
				eq(invitation.teamId, invitedTeam.id),
				eq(invitation.status, "pending"),
			),
			columns: { id: true },
		});
		const alreadyAssigned = assigned.some((entry) => entry.id === memberId);
		if (!alreadyAssigned) {
			validateTeamCapacity(
				assigned.length + pendingForTeam.length,
				invitedTeam.maxMembers,
				1,
			);
		}

		await tx
			.update(member)
			.set({ teamId: invitedTeam.id })
			.where(
				and(
					eq(member.id, memberId),
					eq(member.organizationId, acceptedInvitation.organizationId),
				),
			);
	});
};
