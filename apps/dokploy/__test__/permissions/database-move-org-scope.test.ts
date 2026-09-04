import { beforeEach, describe, expect, it, vi } from "vitest";

// Representative sibling guard: the same org-scope checks restored on
// application.move were also restored on the database-service `move` procedures
// (postgres, redis, mariadb, mysql, mongo, libsql, compose). Postgres is exercised
// here through tRPC's createCaller; the remaining siblings share the identical
// procedure shape and are covered by the schema + manual verification plan.

const mockDb = vi.hoisted(() => {
	const returning = vi.fn(() =>
		Promise.resolve([{ postgresId: "pg-1", appName: "pg-1" }]),
	);
	const set = vi.fn(() => ({ where: () => ({ returning }) }));
	const update = vi.fn(() => ({ set }));
	return {
		update,
		_set: set,
		_ret: returning,
		query: {
			member: { findFirst: vi.fn() },
			organizationRole: { findMany: vi.fn(() => Promise.resolve([])) },
			postgres: { findFirst: vi.fn() },
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

import { postgresRouter } from "@/server/api/routers/postgres";

const ORG_A = "org-a";
const ORG_B = "org-b";

const ctx = (): any => ({
	user: {
		id: "user-1",
		email: "owner@example.com",
		role: "owner" as const,
		ownerId: "owner-1",
	},
	session: { activeOrganizationId: ORG_A },
});

const pgRow = (orgId: string) => ({
	postgresId: "pg-1",
	appName: "pg-1",
	environment: { project: { organizationId: orgId } },
});

const envRow = (orgId: string) => ({
	environmentId: "env-target",
	project: { organizationId: orgId },
});

const memberRow = () => ({
	id: "member-1",
	role: "owner",
	userId: "user-1",
	organizationId: ORG_A,
	accessedServices: ["pg-1"],
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
	mockDb.query.member.findFirst.mockResolvedValue(memberRow());
	mockDb.query.postgres.findFirst.mockResolvedValue(pgRow(ORG_A));
	mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));
	mockDb.query.organizationRole.findMany.mockResolvedValue([]);
});

describe("postgres.move org-scope guards", () => {
	it("allows moving a postgres within the same organization", async () => {
		mockDb.query.postgres.findFirst.mockResolvedValue(pgRow(ORG_A));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));

		const caller = postgresRouter.createCaller(ctx());
		await expect(
			caller.move({ postgresId: "pg-1", targetEnvironmentId: "env-target" }),
		).resolves.toMatchObject({ postgresId: "pg-1" });
		expect(mockDb.update).toHaveBeenCalledOnce();
	});

	it("rejects moving a postgres that belongs to a foreign organization (source check)", async () => {
		mockDb.query.postgres.findFirst.mockResolvedValue(pgRow(ORG_B));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_A));

		const caller = postgresRouter.createCaller(ctx());
		await expect(
			caller.move({ postgresId: "pg-1", targetEnvironmentId: "env-target" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to move this postgres",
		});
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it("rejects moving to a target environment in a foreign organization (target check)", async () => {
		mockDb.query.postgres.findFirst.mockResolvedValue(pgRow(ORG_A));
		mockDb.query.environments.findFirst.mockResolvedValue(envRow(ORG_B));

		const caller = postgresRouter.createCaller(ctx());
		await expect(
			caller.move({ postgresId: "pg-1", targetEnvironmentId: "env-target" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to move to this environment",
		});
		expect(mockDb.update).not.toHaveBeenCalled();
	});
});
