import {
	canEditDeployGitSource,
	getAccessibleGitProviderIds,
	redactGitProviderSecrets,
} from "@dokploy/server/services/git-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
	query: {
		gitProvider: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
		},
		member: {
			findFirst: vi.fn(),
		},
	},
}));

vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

const mockHasValidLicense = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mockHasValidLicense,
}));

const ORG_ID = "org-1";
const USER_OWNER = "user-owner";
const USER_ADMIN = "user-admin";
const USER_MEMBER = "user-member";
const USER_MEMBER_2 = "user-member-2";

const providerOwned = {
	gitProviderId: "gp-owned",
	userId: USER_MEMBER,
	sharedWithOrganization: false,
};
const providerShared = {
	gitProviderId: "gp-shared",
	userId: USER_OWNER,
	sharedWithOrganization: true,
};
const providerPrivate = {
	gitProviderId: "gp-private",
	userId: USER_OWNER,
	sharedWithOrganization: false,
};
const providerOtherMember = {
	gitProviderId: "gp-other",
	userId: USER_MEMBER_2,
	sharedWithOrganization: false,
};

const allProviders = [
	providerOwned,
	providerShared,
	providerPrivate,
	providerOtherMember,
];

function session(userId: string) {
	return { userId, activeOrganizationId: ORG_ID };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.gitProvider.findMany.mockResolvedValue(allProviders);
	mockHasValidLicense.mockResolvedValue(false);
});

describe("redactGitProviderSecrets", () => {
	it("removes nested provider credential fields", () => {
		const redacted = redactGitProviderSecrets({
			name: "compose",
			github: {
				githubClientId: "client-id",
				githubClientSecret: "client-secret",
				githubPrivateKey: "private-key",
				githubWebhookSecret: "webhook-secret",
			},
			gitlab: {
				gitlabUrl: "https://gitlab.example.com",
				secret: "secret",
				accessToken: "access-token",
				refreshToken: "refresh-token",
			},
			gitea: {
				giteaUrl: "https://gitea.example.com",
				clientSecret: "client-secret",
				accessToken: "access-token",
				refreshToken: "refresh-token",
			},
			bitbucket: {
				bitbucketWorkspaceName: "workspace",
				appPassword: "app-password",
				apiToken: "api-token",
			},
		});

		expect(redacted.github).toEqual({ githubClientId: "client-id" });
		expect(redacted.gitlab).toEqual({
			gitlabUrl: "https://gitlab.example.com",
		});
		expect(redacted.gitea).toEqual({ giteaUrl: "https://gitea.example.com" });
		expect(redacted.bitbucket).toEqual({
			bitbucketWorkspaceName: "workspace",
		});
	});
});

describe("getAccessibleGitProviderIds", () => {
	describe("owner", () => {
		beforeEach(() => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "owner",
				accessedGitProviders: [],
			});
		});

		it("returns all org providers", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_OWNER));
			expect(ids).toEqual(new Set(allProviders.map((p) => p.gitProviderId)));
		});

		it("includes providers owned by other members", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_OWNER));
			expect(ids.has(providerOwned.gitProviderId)).toBe(true);
			expect(ids.has(providerOtherMember.gitProviderId)).toBe(true);
		});
	});

	describe("admin", () => {
		beforeEach(() => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "admin",
				accessedGitProviders: [],
			});
		});

		it("returns all org providers", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_ADMIN));
			expect(ids).toEqual(new Set(allProviders.map((p) => p.gitProviderId)));
		});

		it("includes providers owned by other members — fixes issue #4469", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_ADMIN));
			expect(ids.has(providerPrivate.gitProviderId)).toBe(true);
			expect(ids.has(providerOtherMember.gitProviderId)).toBe(true);
		});
	});

	describe("member without enterprise license", () => {
		beforeEach(() => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [providerPrivate.gitProviderId],
			});
			mockHasValidLicense.mockResolvedValue(false);
		});

		it("can access their own provider", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerOwned.gitProviderId)).toBe(true);
		});

		it("can access shared providers", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerShared.gitProviderId)).toBe(true);
		});

		it("cannot access private providers of other users even if assigned (no license)", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerPrivate.gitProviderId)).toBe(false);
		});

		it("cannot access providers of other members", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerOtherMember.gitProviderId)).toBe(false);
		});
	});

	describe("member with enterprise license", () => {
		beforeEach(() => {
			mockHasValidLicense.mockResolvedValue(true);
		});

		it("can access provider explicitly assigned to them", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [providerPrivate.gitProviderId],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerPrivate.gitProviderId)).toBe(true);
		});

		it("cannot access provider not assigned and not shared", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerPrivate.gitProviderId)).toBe(false);
			expect(ids.has(providerOtherMember.gitProviderId)).toBe(false);
		});

		it("can access shared provider even without explicit assignment", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerShared.gitProviderId)).toBe(true);
		});

		it("can access own provider regardless of assignments", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerOwned.gitProviderId)).toBe(true);
		});

		it("cannot access provider of other member even with license but no assignment", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerOtherMember.gitProviderId)).toBe(false);
		});
	});

	describe("member with no member record", () => {
		beforeEach(() => {
			mockDb.query.member.findFirst.mockResolvedValue(null);
			mockHasValidLicense.mockResolvedValue(true);
		});

		it("only returns own providers and shared ones", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerOwned.gitProviderId)).toBe(true);
			expect(ids.has(providerShared.gitProviderId)).toBe(true);
			expect(ids.has(providerPrivate.gitProviderId)).toBe(false);
		});
	});

	describe("enterprise license — member assigned to a provider they do not own", () => {
		// getAccessibleGitProviderIds still returns the provider (member can connect NEW deploys)
		it("member assigned to owner's private provider can USE the provider for new deploys", async () => {
			mockHasValidLicense.mockResolvedValue(true);
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [providerPrivate.gitProviderId],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerPrivate.gitProviderId)).toBe(true);
		});

		it("member NOT assigned to owner's private provider cannot use it at all", async () => {
			mockHasValidLicense.mockResolvedValue(true);
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "member",
				accessedGitProviders: [],
			});
			const ids = await getAccessibleGitProviderIds(session(USER_MEMBER));
			expect(ids.has(providerPrivate.gitProviderId)).toBe(false);
		});
	});

	describe("empty org", () => {
		beforeEach(() => {
			mockDb.query.gitProvider.findMany.mockResolvedValue([]);
			mockDb.query.member.findFirst.mockResolvedValue({
				role: "admin",
				accessedGitProviders: [],
			});
		});

		it("returns empty set when org has no providers", async () => {
			const ids = await getAccessibleGitProviderIds(session(USER_ADMIN));
			expect(ids.size).toBe(0);
		});
	});
});

describe("canEditDeployGitSource", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockHasValidLicense.mockResolvedValue(true);
	});

	describe("owner", () => {
		it("can edit deploy using any provider", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "owner" });
			const result = await canEditDeployGitSource(
				providerPrivate.gitProviderId,
				session(USER_OWNER),
			);
			expect(result).toBe(true);
		});
	});

	describe("admin", () => {
		beforeEach(() => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "admin" });
		});

		it("cannot edit deploy using owner's private provider (not shared)", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_OWNER,
				sharedWithOrganization: false,
			});
			const result = await canEditDeployGitSource(
				providerPrivate.gitProviderId,
				session(USER_ADMIN),
			);
			expect(result).toBe(false);
		});

		it("can edit deploy using a provider shared with the org", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_OWNER,
				sharedWithOrganization: true,
			});
			const result = await canEditDeployGitSource(
				providerShared.gitProviderId,
				session(USER_ADMIN),
			);
			expect(result).toBe(true);
		});

		it("can edit deploy using their own provider", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_ADMIN,
				sharedWithOrganization: false,
			});
			const result = await canEditDeployGitSource(
				"gp-admin-owned",
				session(USER_ADMIN),
			);
			expect(result).toBe(true);
		});
	});

	describe("member", () => {
		beforeEach(() => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "member" });
		});

		it("can edit deploy using their own provider", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_MEMBER,
				sharedWithOrganization: false,
			});
			const result = await canEditDeployGitSource(
				providerOwned.gitProviderId,
				session(USER_MEMBER),
			);
			expect(result).toBe(true);
		});

		it("can edit deploy using a provider shared with the org", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_OWNER,
				sharedWithOrganization: true,
			});
			const result = await canEditDeployGitSource(
				providerShared.gitProviderId,
				session(USER_MEMBER),
			);
			expect(result).toBe(true);
		});

		it("cannot edit deploy using owner's private provider even with enterprise license and assignment", async () => {
			// This is the key case: enterprise, provider del owner, no compartido,
			// member tiene accessedGitProviders asignado — pero NO puede cambiar la branch del deploy del owner
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_OWNER,
				sharedWithOrganization: false,
			});
			const result = await canEditDeployGitSource(
				providerPrivate.gitProviderId,
				session(USER_MEMBER),
			);
			expect(result).toBe(false);
		});

		it("cannot edit deploy using another member's private provider", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue({
				userId: USER_MEMBER_2,
				sharedWithOrganization: false,
			});
			const result = await canEditDeployGitSource(
				providerOtherMember.gitProviderId,
				session(USER_MEMBER),
			);
			expect(result).toBe(false);
		});

		it("returns false if provider does not exist", async () => {
			mockDb.query.gitProvider.findFirst.mockResolvedValue(null);
			const result = await canEditDeployGitSource(
				"nonexistent-id",
				session(USER_MEMBER),
			);
			expect(result).toBe(false);
		});
	});
});
