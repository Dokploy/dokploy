import { sso } from "@better-auth/sso";

const DOMAIN_VERIFICATION_TOKEN_PREFIX = "dokploy-sso";

export const getSSODomainVerificationRecordName = (providerId: string) =>
	`_${DOMAIN_VERIFICATION_TOKEN_PREFIX}-${providerId}`;

export const markSCIMProvisionedUserEmailVerified = <
	T extends { emailVerified?: boolean },
>(
	user: T,
	path?: string,
) => {
	if (!path?.includes("/scim")) {
		return;
	}

	// An organization admin issues the SCIM token and delegates user lifecycle
	// management to that provider, so a successfully provisioned email is the
	// authoritative local identity for the later SSO account-linking check.
	return {
		data: {
			...user,
			emailVerified: true,
		},
	};
};

export const createDokploySSOPlugin = () => {
	const signInPlugin = sso({ trustEmailVerified: true });
	const domainVerificationPlugin = sso({
		trustEmailVerified: true,
		domainVerification: {
			enabled: true,
			tokenPrefix: DOMAIN_VERIFICATION_TOKEN_PREFIX,
		},
	});

	// Domain verification is used as an account-linking trust signal without
	// blocking sign-in for existing, unverified SSO providers. Better Auth checks
	// the persisted domainVerified field when deciding whether an SSO identity may
	// be linked, even when sign-in enforcement itself is disabled.
	return {
		...signInPlugin,
		endpoints: {
			...signInPlugin.endpoints,
			requestDomainVerification:
				domainVerificationPlugin.endpoints.requestDomainVerification,
			verifyDomain: domainVerificationPlugin.endpoints.verifyDomain,
		},
		schema: domainVerificationPlugin.schema,
	};
};
