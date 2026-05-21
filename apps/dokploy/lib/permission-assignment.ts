import { TRPCError } from "@trpc/server";

type PermissionAssignmentTarget = {
	userId: string;
	role: string;
};

export const assertPermissionsAssignableTarget = (
	target: PermissionAssignmentTarget | null | undefined,
	actorUserId: string,
) => {
	if (!target) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Target user is not a member of this organization",
		});
	}

	if (target.userId === actorUserId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot update your own permissions",
		});
	}

	if (target.role === "owner" || target.role === "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Permissions can only be assigned to members or custom roles",
		});
	}
};
