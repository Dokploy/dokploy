type InvitationRemovalState = {
	status: string;
	expiresAt: Date | string;
};

export const canRemoveInvitation = (
	invitation: InvitationRemovalState,
	now = new Date(),
) => {
	return (
		invitation.status !== "pending" ||
		new Date(invitation.expiresAt).getTime() <= now.getTime()
	);
};
