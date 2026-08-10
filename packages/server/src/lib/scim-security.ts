export const DISABLED_PERSONAL_SCIM_MANAGEMENT_PATHS = [
	"/scim/list-provider-connections",
	"/scim/get-provider-connection",
	"/scim/delete-provider-connection",
] as const;

/**
 * Dokploy supports organization-scoped SCIM connections only.
 *
 * Rejecting personal connections prevents users from creating provider records
 * without an organization ownership boundary. Better Auth performs the role
 * check for the supplied organization before invoking this callback.
 */
type SCIMTokenScope = {
	organizationId?: string;
	member: unknown | null;
};

export const canGenerateOrganizationScopedSCIMToken = ({
	organizationId,
	member,
}: SCIMTokenScope) => Boolean(organizationId && member);

export const canGenerateLicensedOrganizationScopedSCIMToken = async (
	input: SCIMTokenScope,
	hasValidLicense: (organizationId: string) => Promise<boolean | undefined>,
) => {
	if (!canGenerateOrganizationScopedSCIMToken(input) || !input.organizationId) {
		return false;
	}
	return Boolean(await hasValidLicense(input.organizationId));
};
