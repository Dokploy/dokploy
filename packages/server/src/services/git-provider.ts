import { db } from "@dokploy/server/db";
import { gitProvider, member } from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export type GitProvider = typeof gitProvider.$inferSelect;
type GitProviderSession = {
	userId: string;
	activeOrganizationId: string;
};

const githubSecretKeys = [
	"githubClientSecret",
	"githubPrivateKey",
	"githubWebhookSecret",
] as const;

const gitlabSecretKeys = [
	"secret",
	"webhookSecret",
	"accessToken",
	"refreshToken",
] as const;

const giteaSecretKeys = [
	"clientSecret",
	"accessToken",
	"refreshToken",
] as const;

const bitbucketSecretKeys = ["appPassword", "apiToken"] as const;

const omitKeys = <T extends object>(value: T, keys: readonly string[]) => {
	const redacted = { ...value } as Record<string, unknown>;
	for (const key of keys) {
		delete redacted[key];
	}
	return redacted as T;
};

const redactNullable = <T extends object | null | undefined>(
	value: T,
	keys: readonly string[],
) => {
	if (!value) {
		return value;
	}
	return omitKeys(value, keys);
};

export const redactGithubProvider = <T extends object | null | undefined>(
	provider: T,
) => redactNullable(provider, githubSecretKeys);

export const redactGitlabProvider = <T extends object | null | undefined>(
	provider: T,
) => redactNullable(provider, gitlabSecretKeys);

export const redactGiteaProvider = <T extends object | null | undefined>(
	provider: T,
) => redactNullable(provider, giteaSecretKeys);

export const redactBitbucketProvider = <T extends object | null | undefined>(
	provider: T,
) => redactNullable(provider, bitbucketSecretKeys);

export const redactGitProviderSecrets = <
	T extends {
		github?: object | null;
		gitlab?: object | null;
		bitbucket?: object | null;
		gitea?: object | null;
	},
>(
	entity: T,
) => ({
	...entity,
	github: redactGithubProvider(entity.github),
	gitlab: redactGitlabProvider(entity.gitlab),
	bitbucket: redactBitbucketProvider(entity.bitbucket),
	gitea: redactGiteaProvider(entity.gitea),
});

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

export const assertGitProviderAccess = async (
	gitProviderId: string | null | undefined,
	session: GitProviderSession,
) => {
	if (!gitProviderId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Git Provider not found",
		});
	}

	const accessibleIds = await getAccessibleGitProviderIds(session);
	if (!accessibleIds.has(gitProviderId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this Git provider",
		});
	}
};

export const assertGitProviderManagementAccess = async (
	gitProviderId: string | null | undefined,
	session: GitProviderSession,
) => {
	if (!gitProviderId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Git Provider not found",
		});
	}

	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(member.userId, session.userId),
			eq(member.organizationId, session.activeOrganizationId),
		),
		columns: {
			role: true,
		},
	});

	if (memberRecord?.role === "owner" || memberRecord?.role === "admin") {
		return;
	}

	const gitProviderRecord = await db.query.gitProvider.findFirst({
		where: eq(gitProvider.gitProviderId, gitProviderId),
		columns: {
			userId: true,
			organizationId: true,
		},
	});

	if (
		!gitProviderRecord ||
		gitProviderRecord.organizationId !== session.activeOrganizationId ||
		gitProviderRecord.userId !== session.userId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to manage this Git provider",
		});
	}
};
