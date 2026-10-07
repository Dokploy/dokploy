import { db } from "@dokploy/server/db";
import {
	account,
	invitation,
	member,
	session,
	user,
} from "@dokploy/server/db/schema";
import { APIError } from "better-auth/api";
import { and, eq, inArray } from "drizzle-orm";

export type TwoFactorStatus = "enabled" | "sso" | "pending" | "not-required";

interface TwoFactorUser {
	id: string;
	twoFactorEnabled?: boolean | null;
}

interface StatusOptions {
	/** Evaluate as if 2FA were required, to preview switching it on. */
	assumeRequired?: boolean;
}

interface StatusesOptions extends StatusOptions {
	/**
	 * Only count this organization's requirement, for showing an
	 * organization's members without revealing what other organizations
	 * require of them.
	 */
	organizationId?: string;
}

export const isTwoFactorRequired = ({
	member,
	organization,
}: {
	member: { require2FA: boolean };
	organization: { require2FA: boolean };
}) => organization.require2FA || member.require2FA;

/**
 * The requirement applies to the user, not to the active organization:
 * otherwise switching organization would get around it. "pending" is the
 * gated state. Users without a password sign in through a provider that
 * handles 2FA itself, so they're never gated.
 */
export const resolveTwoFactorStatus = ({
	twoFactorEnabled,
	required,
	hasPassword,
}: {
	twoFactorEnabled: boolean;
	required: boolean;
	hasPassword: boolean;
}): TwoFactorStatus => {
	if (twoFactorEnabled) return "enabled";
	if (!hasPassword) return "sso";
	return required ? "pending" : "not-required";
};

const userHasPassword = async (userId: string) => {
	const credential = await db.query.account.findFirst({
		where: and(
			eq(account.userId, userId),
			eq(account.providerId, "credential"),
		),
		columns: { password: true },
	});
	return !!credential?.password;
};

export const isTwoFactorRequiredByAnyMembership = async (userId: string) => {
	const memberships = await db.query.member.findMany({
		where: eq(member.userId, userId),
		columns: { require2FA: true },
		with: { organization: { columns: { require2FA: true } } },
	});
	return memberships.some((m) =>
		isTwoFactorRequired({ member: m, organization: m.organization }),
	);
};

export const getUserTwoFactorStatus = async (
	user: TwoFactorUser,
	{ assumeRequired = false }: StatusOptions = {},
) => {
	if (user.twoFactorEnabled) return "enabled";
	const required =
		assumeRequired || (await isTwoFactorRequiredByAnyMembership(user.id));
	// The gate only cares about "pending", so skip the password lookup when
	// nothing requires 2FA.
	if (!required) return "not-required";
	return resolveTwoFactorStatus({
		twoFactorEnabled: false,
		required,
		hasPassword: await userHasPassword(user.id),
	});
};

export const isTwoFactorSetupPending = async (user: TwoFactorUser) =>
	(await getUserTwoFactorStatus(user)) === "pending";

/**
 * Reads twoFactorEnabled from the database rather than a session snapshot,
 * for contexts that outlive a single request such as tRPC WebSocket
 * connections. Returns null when the user no longer exists.
 */
export const isTwoFactorSetupPendingForUserId = async (userId: string) => {
	const current = await db.query.user.findFirst({
		where: eq(user.id, userId),
		columns: { id: true, twoFactorEnabled: true },
	});
	if (!current) return null;
	return isTwoFactorSetupPending(current);
};

export const getTwoFactorStatuses = async (
	users: TwoFactorUser[],
	{ assumeRequired = false, organizationId }: StatusesOptions = {},
) => {
	const userIds = users.map((u) => u.id);
	const [accounts, memberships] = userIds.length
		? await Promise.all([
				db.query.account.findMany({
					where: inArray(account.userId, userIds),
					columns: { userId: true, providerId: true, password: true },
				}),
				assumeRequired
					? []
					: db.query.member.findMany({
							where: and(
								inArray(member.userId, userIds),
								organizationId
									? eq(member.organizationId, organizationId)
									: undefined,
							),
							columns: { userId: true, require2FA: true },
							with: { organization: { columns: { require2FA: true } } },
						}),
			])
		: [[], []];

	const providersByUser = new Map<string, string[]>();
	const withPassword = new Set<string>();
	for (const a of accounts) {
		providersByUser.set(a.userId, [
			...(providersByUser.get(a.userId) ?? []),
			a.providerId,
		]);
		if (a.providerId === "credential" && a.password) withPassword.add(a.userId);
	}

	const requiredUsers = new Set(
		memberships
			.filter((m) =>
				isTwoFactorRequired({ member: m, organization: m.organization }),
			)
			.map((m) => m.userId),
	);

	return new Map(
		users.map((u) => [
			u.id,
			{
				status: resolveTwoFactorStatus({
					twoFactorEnabled: !!u.twoFactorEnabled,
					required: assumeRequired || requiredUsers.has(u.id),
					hasPassword: withPassword.has(u.id),
				}),
				providers: providersByUser.get(u.id) ?? [],
			},
		]),
	);
};

/**
 * Checks every membership, not just the active one, so switching to an
 * organization without the requirement can't be used to turn 2FA off.
 */
export const assertTwoFactorCanBeDisabled = async (userId: string) => {
	if (await isTwoFactorRequiredByAnyMembership(userId)) {
		throw new APIError("FORBIDDEN", {
			message:
				"Two-factor authentication is required by one of your organizations and can't be disabled",
		});
	}
};

/**
 * What a user who must enable 2FA can still call on better-auth: enough for
 * /two-factor-setup to enroll and sign out. Everything else is rejected, so
 * new endpoints are blocked by default.
 */
const TWO_FACTOR_SETUP_AUTH_PATHS = new Set([
	"/get-session",
	"/sign-out",
	"/two-factor/enable",
	"/two-factor/verify-totp",
	"/two-factor/get-totp-uri",
]);

export const isTwoFactorSetupAuthPath = (path: string) =>
	TWO_FACTOR_SETUP_AUTH_PATHS.has(path);

export const assertTwoFactorSetupComplete = async (user: TwoFactorUser) => {
	if (await isTwoFactorSetupPending(user)) {
		throw new APIError("FORBIDDEN", {
			message: "Set up two-factor authentication before continuing",
		});
	}
};

/**
 * The better-auth hooks.before gate. getSession is only called off the
 * allow-list, so setup endpoints don't pay for the lookup.
 */
export const enforceTwoFactorSetupOnAuthPath = async (
	path: string,
	getSession: () => Promise<{ user: TwoFactorUser } | null>,
) => {
	if (isTwoFactorSetupAuthPath(path)) return;
	const current = await getSession();
	if (!current) return;
	await assertTwoFactorSetupComplete(current.user);
	if (path === "/two-factor/disable") {
		await assertTwoFactorCanBeDisabled(current.user.id);
	}
};

export const applyInvitationTwoFactorRequirement = async ({
	invitationId,
	memberId,
}: {
	invitationId: string;
	memberId: string;
}) => {
	// The invitation passed to afterAcceptInvitation comes from better-auth's
	// status update, and whether that includes additional fields depends on
	// adapter internals, so read the flag from the row instead.
	const accepted = await db.query.invitation.findFirst({
		where: eq(invitation.id, invitationId),
		columns: { require2FA: true },
	});
	if (!accepted?.require2FA) return;
	await db
		.update(member)
		.set({ require2FA: true })
		.where(eq(member.id, memberId));
};

/**
 * better-auth 1.6 commits the membership before afterAcceptInvitation runs,
 * so if the invitation's requirement can't be copied, undo the acceptance
 * instead of leaving a membership without it. Reverting the invitation to
 * pending lets the user accept again. Acceptance also switched the session
 * to the new organization, so clear that and let the default membership
 * apply.
 */
export const revertInvitationAcceptance = async ({
	invitationId,
	memberId,
	userId,
	organizationId,
}: {
	invitationId: string;
	memberId: string;
	userId: string;
	organizationId: string;
}) => {
	await db.transaction(async (tx) => {
		await tx.delete(member).where(eq(member.id, memberId));
		await tx
			.update(invitation)
			.set({ status: "pending" })
			.where(eq(invitation.id, invitationId));
		await tx
			.update(session)
			.set({ activeOrganizationId: null })
			.where(
				and(
					eq(session.userId, userId),
					eq(session.activeOrganizationId, organizationId),
				),
			);
	});
};

/** The afterAcceptInvitation hook. */
export const applyInvitationTwoFactorRequirementOrRevert = async ({
	invitationId,
	member,
}: {
	invitationId: string;
	member: { id: string; userId: string; organizationId: string };
}) => {
	try {
		await applyInvitationTwoFactorRequirement({
			invitationId,
			memberId: member.id,
		});
	} catch (error) {
		console.error(
			`Failed to apply the 2FA requirement of invitation ${invitationId} to member ${member.id}, reverting the acceptance`,
			error,
		);
		await revertInvitationAcceptance({
			invitationId,
			memberId: member.id,
			userId: member.userId,
			organizationId: member.organizationId,
		});
		throw error;
	}
};
