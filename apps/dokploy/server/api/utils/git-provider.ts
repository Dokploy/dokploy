import { TRPCError } from "@trpc/server";

export function assertGitProviderAccess(
	provider: { organizationId: string } | { gitProvider: { organizationId: string } },
	activeOrganizationId: string,
) {
	const organizationId =
		"organizationId" in provider
			? provider.organizationId
			: provider.gitProvider.organizationId;

	if (organizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this git provider",
		});
	}
}
