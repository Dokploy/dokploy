import { db } from "@dokploy/server/db";
import { gitProvider, member } from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { findBitbucketById } from "./bitbucket";
import { findGiteaById } from "./gitea";
import { findGithubById } from "./github";
import { findGitlabById } from "./gitlab";

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

	const provider = await db.query.gitProvider.findFirst({
		where: eq(gitProvider.gitProviderId, gitProviderId),
		columns: {
			organizationId: true,
			userId: true,
			sharedWithOrganization: true,
		},
	});

	if (!provider || provider.organizationId !== activeOrganizationId)
		return false;
	if (memberRecord?.role === "owner") return true;

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
 * Must be called before returning any git-provider record that carries secrets
 * (OAuth tokens, app private keys, webhook secrets).
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

type GitProviderReferences = {
	githubId?: string | null;
	gitlabId?: string | null;
	bitbucketId?: string | null;
	giteaId?: string | null;
};

/**
 * Authorizes provider IDs before they are attached to an application or compose.
 * Callers must run this before persisting any user-controlled provider reference.
 */
export const assertGitProviderReferencesAccess = async (
	session: { userId: string; activeOrganizationId: string },
	references: GitProviderReferences,
) => {
	const lookups = [
		references.githubId
			? () => findGithubById(references.githubId as string)
			: null,
		references.gitlabId
			? () => findGitlabById(references.gitlabId as string)
			: null,
		references.bitbucketId
			? () => findBitbucketById(references.bitbucketId as string)
			: null,
		references.giteaId
			? () => findGiteaById(references.giteaId as string)
			: null,
	].filter((lookup) => lookup !== null);

	for (const lookup of lookups) {
		const provider = await lookup();
		await assertGitProviderAccess(session, provider.gitProvider);
	}
};

export const assertGitProviderManageAccess = async (
	session: { userId: string; activeOrganizationId: string },
	provider: {
		gitProviderId: string;
		organizationId: string;
		userId: string;
	},
) => {
	if (provider.organizationId !== session.activeOrganizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Git provider not found",
		});
	}

	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(member.userId, session.userId),
			eq(member.organizationId, session.activeOrganizationId),
		),
		columns: { role: true },
	});
	if (
		memberRecord?.role === "owner" ||
		memberRecord?.role === "admin" ||
		provider.userId === session.userId
	) {
		return;
	}

	throw new TRPCError({
		code: "FORBIDDEN",
		message: "You cannot manage this git provider",
	});
};

type DeployGitSource = {
	sourceType?: string | null;
	github?: { gitProviderId: string } | null;
	gitlab?: { gitProviderId: string } | null;
	bitbucket?: { gitProviderId: string } | null;
	gitea?: { gitProviderId: string } | null;
};

export const assertDeployGitSourceWriteAccess = async (
	session: { userId: string; activeOrganizationId: string },
	deploy: DeployGitSource,
) => {
	const gitProviderId =
		deploy.sourceType === "github"
			? deploy.github?.gitProviderId
			: deploy.sourceType === "gitlab"
				? deploy.gitlab?.gitProviderId
				: deploy.sourceType === "bitbucket"
					? deploy.bitbucket?.gitProviderId
					: deploy.sourceType === "gitea"
						? deploy.gitea?.gitProviderId
						: null;
	if (
		gitProviderId &&
		!(await canEditDeployGitSource(gitProviderId, session))
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot modify this deploy's git source",
		});
	}
};

const gitSourceMutationKeys = new Set([
	"sourceType",
	"githubId",
	"repository",
	"owner",
	"branch",
	"buildPath",
	"gitlabId",
	"gitlabRepository",
	"gitlabOwner",
	"gitlabBranch",
	"gitlabBuildPath",
	"gitlabProjectId",
	"gitlabPathNamespace",
	"bitbucketId",
	"bitbucketRepository",
	"bitbucketRepositorySlug",
	"bitbucketOwner",
	"bitbucketBranch",
	"bitbucketBuildPath",
	"giteaId",
	"giteaRepository",
	"giteaOwner",
	"giteaBranch",
	"giteaBuildPath",
	"customGitUrl",
	"customGitBranch",
	"customGitBuildPath",
	"customGitSSHKeyId",
	"watchPaths",
	"triggerType",
	"enableSubmodules",
]);

export const hasGitSourceMutation = (input: object) =>
	Object.keys(input).some((key) => gitSourceMutationKeys.has(key));
