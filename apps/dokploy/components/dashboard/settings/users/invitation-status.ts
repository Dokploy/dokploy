type InvitationStatusInput = {
	status: string;
	expiresAt: Date | string;
};

export const isInactiveInvitation = (
	invitation: InvitationStatusInput,
	now = new Date(),
) =>
	invitation.status === "canceled" ||
	new Date(invitation.expiresAt).getTime() < now.getTime();
