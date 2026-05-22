import { TRPCError } from "@trpc/server";

type MemberRemovalInput = {
	actorRole: string;
	actorUserId: string;
	targetRole: string;
	targetUserId: string;
};

const STATIC_ADMIN_ROLES = new Set(["owner", "admin"]);

export function assertCanRemoveMemberTarget({
	actorRole,
	actorUserId,
	targetRole,
	targetUserId,
}: MemberRemovalInput) {
	if (targetUserId === actorUserId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot delete yourself",
		});
	}

	if (targetRole === "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot delete the organization owner",
		});
	}

	if (targetRole === "admin" && actorRole !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the organization owner can delete admins",
		});
	}

	if (
		!STATIC_ADMIN_ROLES.has(actorRole) &&
		STATIC_ADMIN_ROLES.has(targetRole)
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Custom roles cannot delete owners or admins",
		});
	}
}
