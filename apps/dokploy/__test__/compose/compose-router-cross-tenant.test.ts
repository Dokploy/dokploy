import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Router-level integration test for the cross-tenant IDOR fixed in the compose
 * router. These tests drive the REAL `composeRouter` through `createCaller`
 * against a controlled DB mock, so they verify that the resource-scoped guards
 * (`assertComposeOrgAccess` / `assertEnvironmentOrgAccess`) are WIRED into the
 * procedures and execute BEFORE any sensitive work (disclosure, move).
 *
 * Before the fix every procedure below relied solely on
 * `checkServicePermissionAndAccess`, which is session-scoped and skips the
 * `accessedServices` membership check for owner/admin, so an owner in org A
 * could read/act on a compose belonging to org B by knowing its composeId.
 */
const memberFindFirst = vi.hoisted(() => vi.fn());
const composeFindFirst = vi.hoisted(() => vi.fn());
const environmentsFindFirst = vi.hoisted(() => vi.fn());
const domainsFindMany = vi.hoisted(() => vi.fn());
const composeUpdate = vi.hoisted(() => vi.fn());
const createAuditLogMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => {
	const returningRow = {
		name: "moved-service",
		composeId: "c-victim",
		environmentId: "env-target",
	};
	// A thenable chain built via a Proxy (no literal `then` property, so it does
	// not trip biome's `noThenProperty` rule). Every builder method returns the
	// chain; `returning` resolves to the row; awaiting the chain resolves to [].
	const chain: any = new Proxy(
		{},
		{
			get: (_target, prop) => {
				if (prop === "then")
					return (resolve: (v: unknown) => void) => resolve([]);
				if (prop === "returning") return () => Promise.resolve([returningRow]);
				return () => chain;
			},
		},
	);
	return {
		db: {
			update: (...args: any[]) => {
				composeUpdate(...args);
				return chain;
			},
			delete: () => chain,
			insert: () => ({
				values: () => ({ returning: () => Promise.resolve([{}]) }),
			}),
			select: () => chain,
			query: {
				member: {
					findFirst: memberFindFirst,
					findMany: vi.fn(() => Promise.resolve([])),
				},
				compose: {
					findFirst: composeFindFirst,
					findMany: vi.fn(() => Promise.resolve([])),
				},
				environments: {
					findFirst: environmentsFindFirst,
					findMany: vi.fn(() => Promise.resolve([])),
				},
				domains: {
					findMany: domainsFindMany,
					findFirst: vi.fn(() => Promise.resolve(undefined)),
				},
				webServerSettings: {
					findFirst: vi.fn(() => Promise.resolve(undefined)),
				},
				organizationRole: {
					findFirst: vi.fn(),
					findMany: vi.fn(() => Promise.resolve([])),
				},
			},
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@dokploy/server/services/proprietary/audit-log", () => ({
	createAuditLog: createAuditLogMock,
}));

import { composeRouter } from "@/server/api/routers/compose";

const ORG_A = "org-A";
const ORG_B = "org-B";

const ownerMember = {
	id: "member-1",
	role: "owner",
	userId: "user-1",
	organizationId: ORG_A,
	accessedProjects: [],
	accessedServices: [],
	accessedEnvironments: [],
	accessedGitProviders: [],
	canCreateProjects: true,
	canDeleteProjects: true,
	canCreateServices: true,
	canDeleteServices: true,
	canCreateEnvironments: true,
	canDeleteEnvironments: true,
	canAccessToTraefikFiles: true,
	canAccessToDocker: true,
	canAccessToAPI: true,
	canAccessToSSHKeys: true,
	canAccessToGitProviders: true,
	user: { id: "user-1", email: "owner@test.test" },
};

const buildCompose = (
	organizationId: string,
	serverId: string | null = null,
) => ({
	composeId: "c-victim",
	name: "victim-service",
	appName: "victim-app",
	composeFile: "",
	sourceType: "raw",
	env: "",
	serverId,
	environment: {
		environmentId: "env-src",
		projectId: "proj-src",
		name: "production",
		description: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		isDefault: true,
		env: "",
		project: {
			projectId: "proj-src",
			name: "victim-project",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			organizationId,
		},
	},
	mounts: [],
	domains: [],
	deployments: [],
});

const buildEnvironment = (organizationId: string) => ({
	environmentId: "env-target",
	projectId: "proj-target",
	name: "target",
	description: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	isDefault: false,
	env: "",
	project: {
		projectId: "proj-target",
		name: "target-project",
		description: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		organizationId,
	},
});

const callerCtx = {
	session: { activeOrganizationId: ORG_A },
	user: {
		id: "user-1",
		email: "owner@test.test",
		role: "owner",
		ownerId: "user-1",
		enableEnterpriseFeatures: false,
		isValidEnterpriseLicense: false,
	},
};

const caller = composeRouter.createCaller(callerCtx as any);

beforeEach(() => {
	vi.clearAllMocks();
	memberFindFirst.mockResolvedValue(ownerMember);
	// Owner is a static role, so resolveRole returns early and never queries
	// organizationRole; checkPermission authorizes service.create / deployment.create.
	createAuditLogMock.mockResolvedValue(undefined);
});

describe("compose router cross-tenant IDOR guards", () => {
	describe("getConvertedCompose (headline single-call disclosure path)", () => {
		it("rejects a cross-org owner with UNAUTHORIZED and does NOT read domains", async () => {
			composeFindFirst.mockResolvedValue(buildCompose(ORG_B));

			await expect(
				caller.getConvertedCompose({ composeId: "c-victim" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			// No disclosure: the rendered compose (with decrypted env + domains)
			// must never be assembled for a cross-tenant caller.
			expect(domainsFindMany).not.toHaveBeenCalled();
		});

		it("throws a TRPCError so tRPC maps the HTTP status", async () => {
			composeFindFirst.mockResolvedValue(buildCompose(ORG_B));
			const err = await caller
				.getConvertedCompose({ composeId: "c-victim" })
				.catch((e) => e);
			expect(err).toBeInstanceOf(TRPCError);
		});

		it("still rejects when the caller is owner/admin (resource-scoped, not role-scoped)", async () => {
			// Owner in org-A must still be rejected for a compose in org-B.
			composeFindFirst.mockResolvedValue(buildCompose(ORG_B));
			await expect(
				caller.getConvertedCompose({ composeId: "c-victim" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		});
	});

	describe("move (lockout path)", () => {
		it("rejects a cross-org source compose with UNAUTHORIZED and does NOT relocate it", async () => {
			composeFindFirst.mockResolvedValue(buildCompose(ORG_B));

			await expect(
				caller.move({
					composeId: "c-victim",
					targetEnvironmentId: "env-target",
				}),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			// The victim compose row must not be moved into the attacker's env.
			expect(composeUpdate).not.toHaveBeenCalled();
		});

		it("rejects a cross-org target environment with UNAUTHORIZED and does NOT relocate it", async () => {
			// Source compose lives in the caller's org (passes source guard)...
			composeFindFirst.mockResolvedValue(buildCompose(ORG_A));
			// ...but the target environment belongs to a different org.
			environmentsFindFirst.mockResolvedValue(buildEnvironment(ORG_B));

			await expect(
				caller.move({
					composeId: "c-victim",
					targetEnvironmentId: "env-target",
				}),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			expect(composeUpdate).not.toHaveBeenCalled();
		});

		it("throws a TRPCError on cross-org target", async () => {
			composeFindFirst.mockResolvedValue(buildCompose(ORG_A));
			environmentsFindFirst.mockResolvedValue(buildEnvironment(ORG_B));
			const err = await caller
				.move({ composeId: "c-victim", targetEnvironmentId: "env-target" })
				.catch((e) => e);
			expect(err).toBeInstanceOf(TRPCError);
		});

		it("allows a legitimate same-org move (no regression) and relocates the row", async () => {
			composeFindFirst.mockResolvedValue(buildCompose(ORG_A));
			environmentsFindFirst.mockResolvedValue(buildEnvironment(ORG_A));

			const result = await caller.move({
				composeId: "c-victim",
				targetEnvironmentId: "env-target",
			});

			expect(composeUpdate).toHaveBeenCalledTimes(1);
			expect(result).toMatchObject({
				composeId: "c-victim",
				environmentId: "env-target",
			});
			// audit must still fire for the successful move
			expect(createAuditLogMock).toHaveBeenCalledTimes(1);
		});
	});
});
