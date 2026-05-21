import { TRPCError } from "@trpc/server";

type InvitationForEmail = {
	organizationId: string;
	status: string;
	expiresAt: Date;
};

export function assertInvitationCanBeEmailed<T extends InvitationForEmail>(
	invitation: T | undefined,
	activeOrganizationId: string,
	now = new Date(),
): asserts invitation is T {
	if (!invitation) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Invitation not found",
		});
	}

	if (invitation.organizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not allowed to send this invitation",
		});
	}

	if (invitation.status !== "pending") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Only pending invitations can be sent",
		});
	}

	if (invitation.expiresAt <= now) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Cannot send an expired invitation",
		});
	}
}
