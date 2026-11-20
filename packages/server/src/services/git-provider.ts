import { db } from "@dokploy/server/db";
import { gitProvider, member } from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export type GitProvider = typeof gitProvider.$inferSelect;

export const removeGitProvider = async (gitProviderId: string) => {
	const result = await db
		.delete(gitProvider)
		.where(eq(gitProvider.gitProviderId, gitProviderId))
		.returning();

	return result[0];
};

export const findGitProviderById = async (gitProviderId: string) => {
	const result = await db.query.gitProvider.findFirst({
		where: eq(gitProvider.gitProviderId, gitProviderId),
	});

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Git Provider not found",
		});
	}
	return result;
};

export const updateGitProvider = async (
	gitProviderId: string,
	input: Partial<GitProvider>,
) => {
	return await db
		.update(gitProvider)
		.set({
			...input,
		})
		.where(eq(gitProvider.gitProviderId, gitProviderId))
		.returning()
		.then((response) => response[0]);
};

// Returns true if the user can edit the git source configuration of an existing
// deploy that is connected to the given provider.
// Owner/admin: always yes.
// Member: only if they own the provider or it's shared with the org.
// Being in accessedGitProviders only grants permission to connect NEW deploys,
// not to modify the git config of an existing deploy owned by someone else.
export const canEditDeployGitSource = async (
	gitProviderId: string,
	session: { userId: string; activeOrganizationId: string },
): Promise<boolean> => {
	const { userId, activeOrganizationId } = session;

	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, activeOrganizationId),
		),
		columns: { role: true },
	});

	if (memberRecord?.role === "owner") return true;

	const provider = await db.query.gitProvider.findFirst({
		where: eq(gitProvider.gitProviderId, gitProviderId),
		columns: { userId: true, sharedWithOrganization: true },
	});

	if (!provider) return false;

	return provider.userId === userId || provider.sharedWithOrganization;
};

export const getAccessibleGitProviderIds = async (session: {
	userId: string;
	activeOrganizationId: string;
}): Promise<Set<string>> => {
	const { userId, activeOrganizationId } = session;

	const allOrgProviders = await db.query.gitProvider.findMany({
		where: eq(gitProvider.organizationId, activeOrganizationId),
		columns: {
			gitProviderId: true,
			userId: true,
			sharedWithOrganization: true,
		},
	});

	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, activeOrganizationId),
		),
		columns: { accessedGitProviders: true, role: true },
	});

	if (memberRecord?.role === "owner" || memberRecord?.role === "admin") {
		return new Set(allOrgProviders.map((p) => p.gitProviderId));
	}

	const licensed = await hasValidLicense(activeOrganizationId);
	const assignedSet = licensed
		? new Set(memberRecord?.accessedGitProviders ?? [])
		: new Set<string>();

	const result = new Set<string>();
	for (const p of allOrgProviders) {
		if (
			p.userId === userId ||
			p.sharedWithOrganization ||
			assignedSet.has(p.gitProviderId)
		) {
			result.add(p.gitProviderId);
		}
	}
	return result;
};

/**
 * Authorizes read access to a specific git provider for the current session.
 * Throws if the provider belongs to a different organization (cross-org IDOR)
 * or if the caller is not entitled to it within the active organization.
 *
 * This only proves the caller may *use* the provider (e.g. pick it as a repo
 * source when creating a deploy) - it does NOT mean they may see its raw
 * credentials. Being able to use a shared provider and being able to read its
 * OAuth tokens / client secrets / private keys are different privileges; gate
 * the latter with canViewGitProviderSecrets before returning secret fields.
 */
export const assertGitProviderAccess = async (
	session: { userId: string; activeOrganizationId: string },
	provider: { gitProviderId: string; organizationId: string },
) => {
	if (provider.organizationId !== session.activeOrganizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Git provider not found",
		});
	}

	const accessibleIds = await getAccessibleGitProviderIds(session);
	if (!accessibleIds.has(provider.gitProviderId)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have access to this git provider",
		});
	}
};

// Being allowed to use a shared provider (assertGitProviderAccess) must not
// imply being allowed to read its raw OAuth tokens / client secrets / private
// keys. Only the provider's owner or an org owner/admin gets those back.
export const canViewGitProviderSecrets = async (
	session: { userId: string; activeOrganizationId: string },
	provider: { userId: string; organizationId: string },
): Promise<boolean> => {
	if (provider.organizationId !== session.activeOrganizationId) return false;
	if (provider.userId === session.userId) return true;

	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(member.userId, session.userId),
			eq(member.organizationId, session.activeOrganizationId),
		),
		columns: { role: true },
	});

	return memberRecord?.role === "owner" || memberRecord?.role === "admin";
};
