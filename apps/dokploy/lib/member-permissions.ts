import { TRPCError } from "@trpc/server";

const staticRoles = new Set(["owner", "admin"]);

export const assertPermissionAssignmentTargetAllowed = ({
	actorUserId,
	targetUserId,
	targetRole,
}: {
	actorUserId: string;
	targetUserId: string;
	targetRole: string;
}) => {
	if (targetUserId === actorUserId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot assign permissions to yourself",
		});
	}

	if (staticRoles.has(targetRole)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Owner and admin permissions cannot be assigned manually",
		});
	}
};
