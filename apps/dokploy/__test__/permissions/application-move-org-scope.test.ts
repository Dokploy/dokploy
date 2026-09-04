import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bridge to the application router is exercised through tRPC's createCaller so
// the org-scope guards that live inline in the procedure (restored by the fix)
// are verified exactly as a real client request would hit them.
//
// The DB is mocked one layer down (same pattern as git-provider-idor.test.ts)
// so the real findApplicationById / findEnvironmentById / checkServicePermissionAndAccess
// run against controlled org/project tree data.

const mockDb = vi.hoisted(() => {
	const returning = vi.fn(() =>
		Promise.resolve([{ applicationId: "app-1", appName: "app-1" }]),
	);
	const set = vi.fn(() => ({ where: () => ({ returning }) }));
	const update = vi.fn(() => ({ set }));
	return {
		update,
		_ret: returning,
		_set: set,
		query: {
			member: { findFirst: vi.fn() },
			organizationRole: { findMany: vi.fn(() => Promise.resolve([])) },
			applications: { findFirst: vi.fn() },
			environments: { findFirst: vi.fn() },
		},
	};
});
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@dokploy/server/services/proprietary/audit-log", () => ({
	createAuditLog: vi.fn(() => Promise.resolve()),
}));

// getAccessibleServerIds is only used by the application.update procedure when
// buildServerId is supplied; keep it deterministic in case it is reached.
vi.mock("@dokploy/server/services/server", () => ({
	getAccessibleServerIds: vi.fn(() => Promise.resolve(new Set())),
}));

import { applicationRouter } from "@/server/api/routers/application";

const ORG_A = "org-a";
const ORG_B = "org-b";

// tRPC's createCaller is typed against the full CreateContextOptions (db/req/res
// + the full better-auth Session). The procedures only read `ctx.user` and
// `ctx.session.activeOrganizationId`; typing the helper as `any` lets createCaller
// accept the minimal ctx while the returned caller stays fully typed by the router.
const ctx = (role: "owner" | "admin" | "member", org = ORG_A): any => ({
	user: {
		id: "user-1",
		email: "owner@example.com",
		role,
		ownerId: "owner-1",
	},
	session: { activeOrganizationId: org },
});

const appRow = (orgId: string) => ({
	applicationId: "app-1",
	appName: "app-1",
	environment: { project: { organizationId: orgId } },
});

const envRow = (orgId: string) => ({
	environmentId: "env-target",
	project: { organizationId: orgId },
});

const memberRow = (
	role: "owner" | "admin" | "member",
	accessedServices: string[] = ["app-1"],
) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: ORG_A,
	accessedServices,
	accessedProjects: [],
	accessedEnvironments: [],
	canCreateServices: true,
	canCreateProjects: true,
	canCreateEnvironments: true,
	canDeleteServices: true,
	canDeleteProjects: true,
	canDeleteEnvironments: true,
	canAccessToTraefikFiles: true,
	canAccessToDocker: true,
	canAccessToAPI: true,
	canAccessToSSHKeys: true,
	canAccessToGitProviders: true,
	user: { id: "user-1", email: "owner@example.com" },
});

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.member.findFirst.mockResolvedValue(memberRow("owner"));
	mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_A));
	mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));
	mockDb.query.organizationRole.findMany.mockResolvedValue([]);
	mockDb._ret.mockResolvedValue([{ applicationId: "app-1", appName: "app-1" }]);
});

describe("application.move org-scope guards", () => {
	it("allows moving an application between environments of the same organization", async () => {
		mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_A));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));

		const caller = applicationRouter.createCaller(ctx("owner"));
		await expect(
			caller.move({
				applicationId: "app-1",
				targetEnvironmentId: "env-target",
			}),
		).resolves.toMatchObject({ applicationId: "app-1" });
		expect(mockDb.update).toHaveBeenCalledOnce();
	});

	it("rejects moving an application that belongs to a foreign organization (source check)", async () => {
		// Headline exfiltration vector: owner of Org A pulls an Org B app into an Org A env.
		mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_B));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));

		const caller = applicationRouter.createCaller(ctx("owner"));
		await expect(
			caller.move({
				applicationId: "app-1",
				targetEnvironmentId: "env-target",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to move this application",
		});
		// The DB write must never run for a rejected move.
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it("rejects moving to a target environment that belongs to a foreign organization (target check)", async () => {
		mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_A));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_B));

		const caller = applicationRouter.createCaller(ctx("owner"));
		await expect(
			caller.move({
				applicationId: "app-1",
				targetEnvironmentId: "env-target",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to move to this environment",
		});
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it("still rejects the foreign-source move for an owner even when accessedServices would otherwise be skipped", async () => {
		// Owner role bypasses the accessedServices list, so the only thing standing
		// between a foreign applicationId and re-parenting is the restored source check.
		mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_B));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));

		const caller = applicationRouter.createCaller(ctx("owner"));
		await expect(
			caller.move({
				applicationId: "app-foreign",
				targetEnvironmentId: "env-target",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it("rejects a non-owner (with access to the source app) moving to a foreign organization (orphaning path)", async () => {
		mockDb.query.member.findFirst.mockResolvedValue(
			memberRow("member", ["app-1"]),
		);
		mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_A));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_B));

		const caller = applicationRouter.createCaller(ctx("member"));
		await expect(
			caller.move({
				applicationId: "app-1",
				targetEnvironmentId: "env-target",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to move to this environment",
		});
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it("throws a TRPCError (so tRPC maps the HTTP status) on the source check", async () => {
		mockDb.query.applications.findFirst.mockResolvedValue(appRow(ORG_B));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));

		const caller = applicationRouter.createCaller(ctx("owner"));
		const err = await caller
			.move({ applicationId: "app-1", targetEnvironmentId: "env-target" })
			.catch((e) => e);
		expect(err).toBeInstanceOf(TRPCError);
	});
});
