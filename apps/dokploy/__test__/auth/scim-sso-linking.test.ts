import {
	createDokploySSOPlugin,
	getSSODomainVerificationRecordName,
	markSCIMProvisionedUserEmailVerified,
} from "@dokploy/server/lib/sso-account-linking";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { describe, expect, it, vi } from "vitest";

const createAccountLinkingContext = (emailVerified: boolean) => {
	const user = {
		id: "scim-user-id",
		name: "Managed User",
		email: "managed@example.com",
		emailVerified,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	const linkAccount = vi.fn();

	return {
		linkAccount,
		context: {
			context: {
				baseURL: "https://dokploy.example.com/api/auth",
				internalAdapter: {
					findOAuthUser: vi.fn().mockResolvedValue({
						accounts: [],
						linkedAccount: null,
						user,
					}),
					linkAccount,
					createSession: vi.fn().mockResolvedValue({
						id: "session-id",
						userId: user.id,
					}),
				},
				logger: {
					error: vi.fn(),
					warn: vi.fn(),
				},
				options: {
					account: { accountLinking: { enabled: true } },
				},
				trustedProviders: [],
			},
		} as never,
	};
};

const ssoIdentity = {
	account: {
		accountId: "entra-subject",
		providerId: "entra-sso",
	},
	trustProviderByName: false,
	userInfo: {
		email: "managed@example.com",
		emailVerified: false,
		id: "entra-subject",
		name: "Managed User",
	},
};

describe("SCIM and SSO account linking", () => {
	it("marks users created by SCIM as email verified", () => {
		const result = markSCIMProvisionedUserEmailVerified(
			{
				email: "managed@example.com",
				emailVerified: false,
			},
			"/scim/v2/Users",
		);

		expect(result).toEqual({
			data: {
				email: "managed@example.com",
				emailVerified: true,
			},
		});
	});

	it("does not alter users created outside the SCIM flow", () => {
		expect(
			markSCIMProvisionedUserEmailVerified(
				{ email: "local@example.com", emailVerified: false },
				"/sign-up/email",
			),
		).toBeUndefined();
	});

	it("adds domain verification as a linking trust signal without enforcing it for sign-in", () => {
		const plugin = createDokploySSOPlugin();

		expect(plugin.options).toEqual({ trustEmailVerified: true });
		expect(plugin.schema.ssoProvider?.fields.domainVerified).toEqual({
			type: "boolean",
			required: false,
		});
		expect(plugin.endpoints.requestDomainVerification).toBeDefined();
		expect(plugin.endpoints.verifyDomain).toBeDefined();
		expect(getSSODomainVerificationRecordName("entra-sso")).toBe(
			"_dokploy-sso-entra-sso",
		);
	});

	it("links a SCIM-provisioned user after the SSO domain is verified", async () => {
		const scimUser = markSCIMProvisionedUserEmailVerified(
			{ emailVerified: false },
			"/scim/v2/Users",
		);
		const { context, linkAccount } = createAccountLinkingContext(
			scimUser?.data.emailVerified ?? false,
		);

		const result = await handleOAuthUserInfo(context, {
			...ssoIdentity,
			isTrustedProvider: true,
		});

		expect(result.error).toBeNull();
		expect(linkAccount).toHaveBeenCalledWith(
			expect.objectContaining({
				accountId: "entra-subject",
				providerId: "entra-sso",
				userId: "scim-user-id",
			}),
		);
	});

	it("still rejects an unverified SSO domain without an email verification claim", async () => {
		const { context, linkAccount } = createAccountLinkingContext(true);

		const result = await handleOAuthUserInfo(context, {
			...ssoIdentity,
			isTrustedProvider: false,
		});

		expect(result.error).toBe("account not linked");
		expect(linkAccount).not.toHaveBeenCalled();
	});
});
