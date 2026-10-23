export const TWO_FACTOR_SETUP_REQUIRED = "TWO_FACTOR_SETUP_REQUIRED";

// organization.all scopes `members` to the current user, so this answers
// "does this organization require 2FA from me".
export const requiresTwoFactor = (organization: {
	require2FA: boolean;
	members: { require2FA: boolean }[];
}) => organization.require2FA || organization.members.some((m) => m.require2FA);
