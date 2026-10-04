export const STATIC_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type StaticRole = (typeof STATIC_ROLES)[number];

export const VIEWER_ROLE = "viewer";

export interface OwnershipTransferInput {
	organizationOwnerId: string;
	actorUserId: string;
	actorRole: string;
	targetUserId: string;
	targetRole: string | null;
}

export const validateOwnershipTransfer = (
	input: OwnershipTransferInput,
): { newOwnerRole: string; previousOwnerRole: string } => {
	if (input.actorUserId !== input.organizationOwnerId) {
		throw new Error("Only the organization owner can transfer ownership");
	}
	if (input.actorRole !== "owner") {
		throw new Error("Only a member with the owner role can transfer ownership");
	}
	if (!input.targetRole) {
		throw new Error("Target user is not a member of this organization");
	}
	if (input.targetUserId === input.actorUserId) {
		throw new Error("You already own this organization");
	}
	if (input.targetRole === "owner") {
		throw new Error("Target user is already an owner");
	}
	return { newOwnerRole: "owner", previousOwnerRole: "admin" };
};

export interface RoleTransitionInput {
	actorRole: string;
	targetCurrentRole: string;
	newRole: string;
	isSelf: boolean;
	roleExists?: (role: string) => boolean;
}

export const validateRoleTransition = (input: RoleTransitionInput): void => {
	if (input.isSelf) {
		throw new Error("You cannot change your own role");
	}
	if (input.targetCurrentRole === "owner" || input.newRole === "owner") {
		throw new Error(
			"The owner role is nontransferable, use transferOwnership instead",
		);
	}
	if (input.actorRole === "admin" && input.targetCurrentRole === "admin") {
		throw new Error(
			"Only the organization owner can change admin roles. Admins can only modify member roles.",
		);
	}
	if (
		!STATIC_ROLES.includes(input.newRole as StaticRole) &&
		input.roleExists &&
		!input.roleExists(input.newRole)
	) {
		throw new Error(`Custom role "${input.newRole}" not found`);
	}
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeInviteEmails = (raw: string[]): string[] => {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const entry of raw) {
		const email = entry.toLowerCase().trim();
		if (!email) continue;
		if (!EMAIL_RE.test(email)) {
			throw new Error(`Invalid email address: ${entry}`);
		}
		if (!seen.has(email)) {
			seen.add(email);
			result.push(email);
		}
	}
	if (result.length === 0) {
		throw new Error("At least one email address is required");
	}
	if (result.length > 100) {
		throw new Error("Cannot invite more than 100 members at once");
	}
	return result;
};

export interface InvitationLike {
	id: string;
	status: string;
	expiresAt: Date;
}

export const filterExpiredInvitations = <T extends InvitationLike>(
	invitations: T[],
	now: Date = new Date(),
): T[] => {
	return invitations.filter(
		(inv) =>
			inv.status === "pending" && inv.expiresAt.getTime() <= now.getTime(),
	);
};

export const validateInvitationCutoff = (
	before: Date | undefined,
	now: Date = new Date(),
): Date => {
	const cutoff = before ?? now;
	if (cutoff.getTime() > now.getTime()) {
		throw new Error("Invitation cleanup cutoff cannot be in the future");
	}
	return cutoff;
};

export const validateTeamCapacity = (
	currentCount: number,
	maxMembers: number | null | undefined,
	incoming = 1,
): void => {
	if (maxMembers == null) return;
	if (maxMembers < 1) {
		throw new Error("Team size limit must be at least 1");
	}
	if (currentCount + incoming > maxMembers) {
		throw new Error(
			`Team is full (limit ${maxMembers}, ${currentCount} member(s) already assigned)`,
		);
	}
};

export const sanitizeTeamName = (name: string): string => {
	const trimmed = name.trim();
	if (trimmed.length < 1 || trimmed.length > 100) {
		throw new Error("Team name must be between 1 and 100 characters");
	}
	return trimmed;
};

export const isUniqueConstraintError = (error: unknown): boolean => {
	if (!error || typeof error !== "object") return false;
	if ("code" in error && error.code === "23505") return true;
	return "cause" in error && isUniqueConstraintError(error.cause);
};

export const resolveMemberServers = (
	memberServers: string[],
	teamServers: string[] | null | undefined,
): string[] => {
	return [...new Set([...(memberServers ?? []), ...(teamServers ?? [])])];
};

export const isViewerRole = (role: string): boolean => role === VIEWER_ROLE;
