import { db } from "@dokploy/server/db";
import { invitation, member, team } from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";

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
		columns: { id: true },
	});
	if (!invitedTeam) return;
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
