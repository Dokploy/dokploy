import { TRPCError } from "@trpc/server";

const ownerRole = "owner";
const adminRole = "admin";

export const assertMemberRoleUpdateAllowed = ({
	actorRole,
	actorUserId,
	targetUserId,
	targetRole,
	nextRole,
}: {
	actorRole: string;
	actorUserId: string;
	targetUserId: string;
	targetRole: string;
	nextRole: string;
}) => {
	if (targetUserId === actorUserId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot change your own role",
		});
	}

	if (targetRole === ownerRole || nextRole === ownerRole) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "The owner role is nontransferable",
		});
	}

	if (
		actorRole !== ownerRole &&
		(targetRole === adminRole || nextRole === adminRole)
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Only the organization owner can change admin roles. Admins and custom roles can only modify member roles.",
		});
	}
};
