import { db } from "@dokploy/server/db";
import { gitProvider } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

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

export function canAccessProvider(
	gitProvider: GitProvider,
	activeOrganizationId: string,
	userId: string,
): boolean {
	const isInOrg = gitProvider.organizationId === activeOrganizationId;
	const isOwner = gitProvider.userId === userId;
	const isShared = gitProvider.sharedInOrg;
	return isInOrg && (isOwner || isShared);
}

export function filterVisibleProviders<T extends { gitProvider: GitProvider }>(
	providers: T[],
	activeOrganizationId: string,
	userId: string,
): T[] {
	return providers.filter((provider) =>
		canAccessProvider(provider.gitProvider, activeOrganizationId, userId),
	);
}
