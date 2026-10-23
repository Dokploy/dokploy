import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	provider: vi.fn(),
	providers: vi.fn(),
	member: vi.fn(),
	app: vi.fn(),
	compose: vi.fn(),
	update: vi.fn(),
	sync: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			azureDevops: { findFirst: mocks.provider },
			gitProvider: {
				findMany: mocks.providers,
				findFirst: async () => (await mocks.provider()).gitProvider,
			},
			member: { findFirst: mocks.member },
			applications: { findFirst: mocks.app },
			compose: { findFirst: mocks.compose },
		},
		transaction: async (callback: (tx: unknown) => unknown) =>
			callback({
				execute: vi.fn(),
				query: {
					applications: { findFirst: mocks.app },
					compose: { findFirst: mocks.compose },
				},
				update: () => ({
					set: mocks.update.mockReturnValue({ where: async () => undefined }),
				}),
			}),
	},
}));
vi.mock("@dokploy/server/services/azure-devops-hooks", () => ({
	reconcileAzureDevopsProvider: mocks.sync,
}));
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: async () => true,
}));

import { azureDevops } from "@dokploy/server/db/schema";
import {
	assertAzureDevopsSourceAccess,
	safeAzureDevops,
	updateAzureDevops,
} from "@dokploy/server/services/azure-devops";
import { assertGitProviderAccess } from "@dokploy/server/services/git-provider";

const provider = {
	azureDevopsId: "azure",
	gitProviderId: "gp",
	baseUrl: "https://ado.test/tfs/c",
	personalAccessToken: "private-pat",
	gitProvider: {
		gitProviderId: "gp",
		organizationId: "org",
		userId: "creator",
		sharedWithOrganization: false,
		providerType: "azureDevops" as const,
		name: "Azure",
		createdAt: "now",
	},
};
const session = { userId: "member", activeOrganizationId: "org" };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.provider.mockResolvedValue(provider);
	mocks.providers.mockResolvedValue([provider.gitProvider]);
	mocks.member.mockResolvedValue({ role: "member", accessedGitProviders: [] });
	mocks.app.mockResolvedValue(undefined);
	mocks.compose.mockResolvedValue(undefined);
});

describe("Azure DevOps provider access and secret boundaries", () => {
	it("encrypts the PAT through the shared database column type", () => {
		const stored =
			azureDevops.personalAccessToken.mapToDriverValue("private-pat");
		expect(stored).toMatch(/^enc:v1:/);
		expect(stored).not.toContain("private-pat");
		expect(azureDevops.personalAccessToken.mapFromDriverValue(stored)).toBe(
			"private-pat",
		);
	});
	it("omits the PAT even for the provider owner", () => {
		const safe = safeAzureDevops(provider);
		expect(safe).not.toHaveProperty("personalAccessToken");
		expect(JSON.stringify(safe)).not.toContain("private-pat");
		expect(safe.isConfigured).toBe(true);
	});
	it("rejects cross-organization access", async () =>
		expect(
			assertGitProviderAccess(
				{ ...session, activeOrganizationId: "other" },
				provider.gitProvider,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" }));
	it("rejects unassigned private providers when connecting a source", async () =>
		expect(
			assertAzureDevopsSourceAccess(
				session,
				{ sourceType: "git", azureDevopsId: null },
				"azure",
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" }));
	it.each([true, false])(
		"allows shared or explicitly assigned providers for a new source (shared=%s)",
		async (shared) => {
			mocks.providers.mockResolvedValue([
				{ ...provider.gitProvider, sharedWithOrganization: shared },
			]);
			mocks.member.mockResolvedValue({
				role: "member",
				accessedGitProviders: ["gp"],
			});
			await expect(
				assertAzureDevopsSourceAccess(
					session,
					{ sourceType: "git", azureDevopsId: null },
					"azure",
				),
			).resolves.toBeUndefined();
		},
	);
	it("does not grant management rights to shared-provider users", async () => {
		mocks.providers.mockResolvedValue([
			{ ...provider.gitProvider, sharedWithOrganization: true },
		]);
		await expect(
			updateAzureDevops({ azureDevopsId: "azure", name: "renamed" }, session),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it("does not grant existing-source editing rights to assigned-only users", async () => {
		mocks.member.mockResolvedValue({
			role: "member",
			accessedGitProviders: ["gp"],
		});
		await expect(
			assertAzureDevopsSourceAccess(
				session,
				{ sourceType: "azureDevops", azureDevopsId: "azure" },
				"azure",
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("preserves existing-source restrictions for an admin using another user's private provider", async () => {
		mocks.member.mockResolvedValue({ role: "admin" });
		await expect(
			assertAzureDevopsSourceAccess(session, {
				sourceType: "azureDevops",
				azureDevopsId: "azure",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it.each(["owner", "admin"])(
		"allows organization %s to rotate credentials",
		async (role) => {
			mocks.member.mockResolvedValue({ role });
			await expect(
				updateAzureDevops(
					{ azureDevopsId: "azure", personalAccessToken: "rotated-pat" },
					session,
				),
			).resolves.toEqual({ success: true });
			expect(mocks.update).toHaveBeenCalledWith(
				expect.objectContaining({ personalAccessToken: "rotated-pat" }),
			);
		},
	);
	it("preserves the PAT when editing without a new token", async () => {
		await updateAzureDevops(
			{ azureDevopsId: "azure", name: "Renamed" },
			{ ...session, userId: "creator" },
		);
		expect(mocks.update).toHaveBeenCalledTimes(1);
		expect(mocks.update).toHaveBeenCalledWith({ name: "Renamed" });
		expect(
			mocks.update.mock.calls.every(
				([value]) => !Object.hasOwn(value, "personalAccessToken"),
			),
		).toBe(true);
	});
	it("rejects base URL changes while either service type is connected", async () => {
		for (const connected of [mocks.app, mocks.compose]) {
			connected.mockResolvedValue({ id: "service" });
			await expect(
				updateAzureDevops(
					{ azureDevopsId: "azure", baseUrl: "https://ado.test/other" },
					{ ...session, userId: "creator" },
				),
			).rejects.toMatchObject({ code: "CONFLICT" });
			connected.mockResolvedValue(undefined);
		}
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
