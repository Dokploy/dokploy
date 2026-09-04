import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Router-level IDOR guard for the *.update handlers.
//
// Models the exploit from the bug report: an attacker who has
// `gitProviders:create` in their own org (so withPermission passes) and knows a
// victim's <provider>Id calls <provider>.update with the victim id plus their own
// gitProviderId. The handler must resolve the row's owning git_provider via
// find*ById and run assertGitProviderAccess BEFORE mutating, so:
//   - cross-org updates are rejected (NOT_FOUND);
//   - updateGitProvider is no longer fed organizationId (cannot move a provider
//     across orgs);
//   - the service layer never repoints gitProviderId (FK-repoint mechanism closed).

const mockFindGiteaById = vi.hoisted(() => vi.fn());
const mockFindGithubById = vi.hoisted(() => vi.fn());
const mockFindGitlabById = vi.hoisted(() => vi.fn());
const mockUpdateGitProvider = vi.hoisted(() =>
	vi.fn().mockResolvedValue(undefined),
);

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		findGiteaById: mockFindGiteaById,
		findGithubById: mockFindGithubById,
		findGitlabById: mockFindGitlabById,
		updateGitProvider: mockUpdateGitProvider,
	};
});

vi.mock("@dokploy/server/services/permission", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/services/permission")
		>();
	return { ...actual, checkPermission: vi.fn().mockResolvedValue(undefined) };
});

const mockHasValidLicense = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mockHasValidLicense,
}));

// Real `updateGitProvider` (kept real) and `assertGitProviderAccess`/`update*`
// (kept real via the barrel) run against this db mock. `update` captures the
// `.set()` arg so we can prove the service never repoints the FK, while `query`
// feeds `getAccessibleGitProviderIds` for the same-org success path.
const mocks = vi.hoisted(() => {
	const capture = { setArgs: [] as unknown[] };
	const dbSetMock = vi.fn((values: unknown) => {
		capture.setArgs.push(values);
		return { where: () => ({ returning: () => Promise.resolve([{}]) }) };
	});
	const gitProviderFindMany = vi.fn(() =>
		Promise.resolve([
			{
				gitProviderId: "gp-1",
				userId: "user-1",
				sharedWithOrganization: false,
			},
		]),
	);
	const memberFindFirst = vi.fn(() =>
		Promise.resolve({ role: "owner", accessedGitProviders: [] }),
	);
	const db = {
		update: vi.fn(() => ({ set: dbSetMock })),
		query: {
			gitProvider: {
				findMany: gitProviderFindMany,
				findFirst: vi.fn(() => Promise.resolve(undefined)),
			},
			member: {
				findFirst: memberFindFirst,
				findMany: vi.fn(() => Promise.resolve([])),
			},
		},
	};
	return { capture, dbSetMock, db };
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn().mockResolvedValue({ session: null, user: null }),
}));

const mockAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/server/api/utils/audit", () => ({ audit: mockAudit }));

import { giteaRouter } from "@/server/api/routers/gitea";
import { githubRouter } from "@/server/api/routers/github";
import { gitlabRouter } from "@/server/api/routers/gitlab";

const ORG = "org-1";
const USER = "user-1";

const ownProvider = {
	gitProviderId: "gp-1",
	organizationId: ORG,
	userId: USER,
	name: "mine",
	providerType: "gitea",
	createdAt: "",
	sharedWithOrganization: false,
};

const foreignProvider = {
	gitProviderId: "gp-victim",
	organizationId: "org-2",
	userId: "user-2",
	name: "victim",
	providerType: "gitea",
	createdAt: "",
	sharedWithOrganization: false,
};

const buildCtx = () =>
	({
		session: { userId: USER, activeOrganizationId: ORG },
		user: { id: USER, email: "owner@test.com", role: "owner" },
		db: mocks.db,
		req: {},
		res: {},
	}) as unknown as Parameters<(typeof giteaRouter)["createCaller"]>[0];

beforeEach(() => {
	vi.clearAllMocks();
	mocks.capture.setArgs.length = 0;
	mockFindGiteaById.mockResolvedValue({
		giteaId: "gitea-1",
		gitProvider: ownProvider,
	});
	mockFindGithubById.mockResolvedValue({
		githubId: "gh-1",
		gitProvider: ownProvider,
	});
	mockFindGitlabById.mockResolvedValue({
		gitlabId: "gl-1",
		gitProvider: ownProvider,
	});
});

describe("gitea.update — cross-org IDOR guard", () => {
	const caller = () => giteaRouter.createCaller(buildCtx());

	it("rejects a cross-org update (victim giteaId + attacker gitProviderId)", async () => {
		mockFindGiteaById.mockResolvedValue({
			giteaId: "gitea-victim",
			gitProvider: foreignProvider,
		});

		const err = await caller()
			.update({
				giteaId: "gitea-victim",
				gitProviderId: "gp-attacker",
				name: "stolen",
				giteaUrl: "https://gitea.com",
			})
			.catch((e) => e);

		expect(err).toBeInstanceOf(TRPCError);
		expect(err).toMatchObject({ code: "NOT_FOUND" });
		expect(mockUpdateGitProvider).not.toHaveBeenCalled();
		expect(mocks.dbSetMock).not.toHaveBeenCalled();
		expect(mockAudit).not.toHaveBeenCalled();
	});

	it("does not pass organizationId to updateGitProvider", async () => {
		await caller().update({
			giteaId: "gitea-1",
			gitProviderId: "gp-1",
			name: "renamed",
			giteaUrl: "https://gitea.com",
		});

		expect(mockUpdateGitProvider).toHaveBeenCalledWith("gp-1", {
			name: "renamed",
		});
	});

	it("does not repoint the gitea row's gitProviderId via the service", async () => {
		await caller().update({
			giteaId: "gitea-1",
			gitProviderId: "gp-attacker",
			name: "stolen",
			giteaUrl: "https://gitea.com",
		});

		expect(mocks.dbSetMock).toHaveBeenCalledTimes(1);
		const setArg = mocks.capture.setArgs[0] as Record<string, unknown>;
		expect(setArg).not.toHaveProperty("giteaId");
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg.giteaUrl).toBe("https://gitea.com");
	});

	it("succeeds for a legitimate same-org own-provider update", async () => {
		const result = await caller().update({
			giteaId: "gitea-1",
			gitProviderId: "gp-1",
			name: "renamed",
			giteaUrl: "https://gitea.com",
		});
		expect(result).toEqual({ success: true });
		expect(mockAudit).toHaveBeenCalledTimes(1);
	});
});

describe("github.update — cross-org IDOR guard", () => {
	const caller = () => githubRouter.createCaller(buildCtx());

	it("rejects a cross-org update", async () => {
		mockFindGithubById.mockResolvedValue({
			githubId: "gh-victim",
			gitProvider: foreignProvider,
		});

		await expect(
			caller().update({
				githubId: "gh-victim",
				gitProviderId: "gp-attacker",
				name: "stolen",
				githubAppName: "stolen-app",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		expect(mockUpdateGitProvider).not.toHaveBeenCalled();
		expect(mocks.dbSetMock).not.toHaveBeenCalled();
	});

	it("does not pass organizationId to updateGitProvider", async () => {
		await caller().update({
			githubId: "gh-1",
			gitProviderId: "gp-1",
			name: "renamed",
			githubAppName: "my-app",
		});

		expect(mockUpdateGitProvider).toHaveBeenCalledWith("gp-1", {
			name: "renamed",
		});
	});

	it("does not repoint the github row's gitProviderId via the service", async () => {
		await caller().update({
			githubId: "gh-1",
			gitProviderId: "gp-attacker",
			name: "stolen",
			githubAppName: "stolen-app",
		});

		expect(mocks.dbSetMock).toHaveBeenCalledTimes(1);
		const setArg = mocks.capture.setArgs[0] as Record<string, unknown>;
		expect(setArg).not.toHaveProperty("githubId");
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg.githubAppName).toBe("stolen-app");
	});
});

describe("gitlab.update — cross-org IDOR guard", () => {
	const caller = () => gitlabRouter.createCaller(buildCtx());

	it("rejects a cross-org update", async () => {
		mockFindGitlabById.mockResolvedValue({
			gitlabId: "gl-victim",
			gitProvider: foreignProvider,
		});

		await expect(
			caller().update({
				gitlabId: "gl-victim",
				gitProviderId: "gp-attacker",
				name: "stolen",
				gitlabUrl: "https://gitlab.com",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		expect(mockUpdateGitProvider).not.toHaveBeenCalled();
		expect(mocks.dbSetMock).not.toHaveBeenCalled();
	});

	it("does not pass organizationId to updateGitProvider", async () => {
		await caller().update({
			gitlabId: "gl-1",
			gitProviderId: "gp-1",
			name: "renamed",
			gitlabUrl: "https://gitlab.com",
		});

		expect(mockUpdateGitProvider).toHaveBeenCalledWith("gp-1", {
			name: "renamed",
		});
	});

	it("does not repoint the gitlab row's gitProviderId via the service", async () => {
		await caller().update({
			gitlabId: "gl-1",
			gitProviderId: "gp-attacker",
			name: "stolen",
			gitlabUrl: "https://gitlab.com",
		});

		expect(mocks.dbSetMock).toHaveBeenCalledTimes(1);
		const setArg = mocks.capture.setArgs[0] as Record<string, unknown>;
		expect(setArg).not.toHaveProperty("gitlabId");
		expect(setArg).not.toHaveProperty("gitProviderId");
		expect(setArg.gitlabUrl).toBe("https://gitlab.com");
	});
});
