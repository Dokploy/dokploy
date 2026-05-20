type InvitationStatus =
	| "pending"
	| "accepted"
	| "canceled"
	| "rejected"
	| string;

export const isInvitationRemovable = (
	status: InvitationStatus,
	expiresAt: Date | string,
	now = new Date(),
) => status !== "pending" || new Date(expiresAt).getTime() <= now.getTime();
