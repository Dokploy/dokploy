import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mock functions for the collaborators the `move` procedures depend on.
const mockFindLibsqlById = vi.hoisted(() => vi.fn());
const mockFindPostgresById = vi.hoisted(() => vi.fn());
const mockFindRedisById = vi.hoisted(() => vi.fn());
const mockFindMongoById = vi.hoisted(() => vi.fn());
const mockFindMySqlById = vi.hoisted(() => vi.fn());
const mockFindMariadbById = vi.hoisted(() => vi.fn());
const mockFindComposeById = vi.hoisted(() => vi.fn());
const mockFindApplicationById = vi.hoisted(() => vi.fn());
const mockFindEnvironmentById = vi.hoisted(() => vi.fn());
const mockCheckServicePermissionAndAccess = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => vi.fn());

// Preserve the real `@dokploy/server` barrel (so every router's named import
// resolves) but override the finders that `move` uses to assert org ownership.
vi.mock("@dokploy/server", async (importOriginal) => {
	const actual: Record<string, unknown> = await importOriginal();
	return {
		...actual,
		findLibsqlById: mockFindLibsqlById,
		findPostgresById: mockFindPostgresById,
		findRedisById: mockFindRedisById,
		findMongoById: mockFindMongoById,
		findMySqlById: mockFindMySqlById,
		findMariadbById: mockFindMariadbById,
		findComposeById: mockFindComposeById,
		findApplicationById: mockFindApplicationById,
		findEnvironmentById: mockFindEnvironmentById,
	};
});

vi.mock("@dokploy/server/services/permission", async (importOriginal) => {
	const actual: Record<string, unknown> = await importOriginal();
	return {
		...actual,
		checkServicePermissionAndAccess: mockCheckServicePermissionAndAccess,
	};
});

// Avoid a real postgres connection from the apps/dokploy-local db module.
vi.mock("@/server/db", () => ({
	db: { update: mockDbUpdate },
}));

// The sibling routers (postgres, redis, ...) import `db` from the server
// package's db module instead of the apps-local one. Reuse the global
// setup mock's shape (so unrelated drizzle/better-auth init keeps working)
// but route `update` through the controllable hoisted mock so each `move`
// happy-path can return a precise row.
vi.mock("@dokploy/server/db", () => {
	// A chainable built on a real Promise (no user-defined `then`): any
	// terminal `await` resolves to [], satisfying the drizzle chains the
	// server barrel runs at import (e.g. better-auth trusted-origins init)
	// without noise and without tripping the `noThenProperty` lint rule.
	type Chainable = Promise<unknown[]> & {
		[key: string]: (...args: unknown[]) => unknown;
	};
	const chainable = () => {
		const p = Promise.resolve([]) as unknown as Chainable;
		const next = () => chainable();
		p.from = next;
		p.innerJoin = next;
		p.leftJoin = next;
		p.where = next;
		p.limit = next;
		p.orderBy = next;
		p.groupBy = next;
		p.having = next;
		p.set = next;
		p.values = next;
		p.returning = () => Promise.resolve([{}]);
		return p;
	};
	const tableMock = {
		findFirst: () => Promise.resolve(undefined),
		findMany: () => Promise.resolve([]),
	};
	return {
		db: {
			select: () => chainable(),
			insert: () => ({
				values: () => ({ returning: () => Promise.resolve([{}]) }),
			}),
			update: mockDbUpdate,
			delete: () => chainable(),
			query: new Proxy({} as Record<string, typeof tableMock>, {
				get: () => tableMock,
			}),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@/server/api/utils/audit", () => ({
	audit: mockAudit,
}));

import { applicationRouter } from "@/server/api/routers/application";
import { composeRouter } from "@/server/api/routers/compose";
import { libsqlRouter } from "@/server/api/routers/libsql";
import { mariadbRouter } from "@/server/api/routers/mariadb";
import { mongoRouter } from "@/server/api/routers/mongo";
import { mysqlRouter } from "@/server/api/routers/mysql";
import { postgresRouter } from "@/server/api/routers/postgres";
import { redisRouter } from "@/server/api/routers/redis";

const buildCtx = (organizationId: string) => ({
	user: {
		id: "user-1",
		email: "u@example.com",
		role: "owner" as const,
		ownerId: "user-1",
		enableEnterpriseFeatures: false,
		isValidEnterpriseLicense: false,
	},
	session: {
		activeOrganizationId: organizationId,
	},
});

// `db.update(table).set(...).where(...).returning()` resolves to a row array;
// the procedure then does `.then((res) => res[0])`. Mock that chain once.
const mockUpdateChainOnce = (row: Record<string, unknown>) => {
	mockDbUpdate.mockReturnValueOnce({
		set: () => ({
			where: () => ({
				returning: () => Promise.resolve([row]),
			}),
		}),
	});
};

beforeEach(() => {
	vi.clearAllMocks();
	mockCheckServicePermissionAndAccess.mockResolvedValue(undefined);
	mockDbUpdate.mockImplementation(() => {
		throw new Error("db.update should not be reached");
	});
});

describe("libsql.move — cross-organization reparenting (IDOR)", () => {
	const callMove = (orgId: string) =>
		libsqlRouter.createCaller(buildCtx(orgId) as never);

	it("rejects when the source libsql belongs to another organization", async () => {
		mockFindLibsqlById.mockResolvedValue({
			libsqlId: "L",
			appName: "a",
			environment: { project: { organizationId: "org-other" } },
		});

		await expect(
			callMove("org-1").move({ libsqlId: "L", targetEnvironmentId: "E" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		// The source check must short-circuit before fetching the target or
		// touching the database.
		expect(mockFindEnvironmentById).not.toHaveBeenCalled();
		expect(mockDbUpdate).not.toHaveBeenCalled();
		expect(mockAudit).not.toHaveBeenCalled();
	});

	it("rejects when the target environment belongs to another organization", async () => {
		mockFindLibsqlById.mockResolvedValue({
			libsqlId: "L",
			appName: "a",
			environment: { project: { organizationId: "org-1" } },
		});
		mockFindEnvironmentById.mockResolvedValue({
			environmentId: "E",
			project: { organizationId: "org-other" },
		});

		await expect(
			callMove("org-1").move({ libsqlId: "L", targetEnvironmentId: "E" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mockDbUpdate).not.toHaveBeenCalled();
		expect(mockAudit).not.toHaveBeenCalled();
	});

	it("moves the service when both source and target are in the active org", async () => {
		const moved = { libsqlId: "L", appName: "a", environmentId: "E" };
		mockFindLibsqlById.mockResolvedValue({
			libsqlId: "L",
			appName: "a",
			environment: { project: { organizationId: "org-1" } },
		});
		mockFindEnvironmentById.mockResolvedValue({
			environmentId: "E",
			project: { organizationId: "org-1" },
		});
		mockUpdateChainOnce(moved);

		const result = await callMove("org-1").move({
			libsqlId: "L",
			targetEnvironmentId: "E",
		});

		expect(result).toEqual(moved);
		expect(mockDbUpdate).toHaveBeenCalledTimes(1);
		expect(mockFindEnvironmentById).toHaveBeenCalledWith("E");
		expect(mockAudit).toHaveBeenCalledTimes(1);
	});

	it("still enforces checkServicePermissionAndAccess before the org checks", async () => {
		mockCheckServicePermissionAndAccess.mockRejectedValueOnce(
			new Error("permission denied"),
		);

		await expect(
			callMove("org-1").move({ libsqlId: "L", targetEnvironmentId: "E" }),
		).rejects.toThrow("permission denied");

		expect(mockFindLibsqlById).not.toHaveBeenCalled();
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("detects a same-name organization id collision only by exact match", async () => {
		// Distinct orgs must not be treated as equal even when the caller's
		// active org and the source org are both non-empty strings.
		mockFindLibsqlById.mockResolvedValue({
			libsqlId: "L",
			appName: "a",
			environment: { project: { organizationId: "ORG-1" } },
		});

		await expect(
			callMove("org-1").move({ libsqlId: "L", targetEnvironmentId: "E" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("postgres.move — same cross-organization guard", () => {
	const callMove = (orgId: string) =>
		postgresRouter.createCaller(buildCtx(orgId) as never);

	it("rejects when the source postgres belongs to another organization", async () => {
		mockFindPostgresById.mockResolvedValue({
			postgresId: "P",
			appName: "a",
			environment: { project: { organizationId: "org-other" } },
		});

		await expect(
			callMove("org-1").move({ postgresId: "P", targetEnvironmentId: "E" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mockFindEnvironmentById).not.toHaveBeenCalled();
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("rejects when the target environment belongs to another organization", async () => {
		mockFindPostgresById.mockResolvedValue({
			postgresId: "P",
			appName: "a",
			environment: { project: { organizationId: "org-1" } },
		});
		mockFindEnvironmentById.mockResolvedValue({
			environmentId: "E",
			project: { organizationId: "org-other" },
		});

		await expect(
			callMove("org-1").move({ postgresId: "P", targetEnvironmentId: "E" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("moves the service when both source and target are in the active org", async () => {
		const moved = { postgresId: "P", appName: "a", environmentId: "E" };
		mockFindPostgresById.mockResolvedValue({
			postgresId: "P",
			appName: "a",
			environment: { project: { organizationId: "org-1" } },
		});
		mockFindEnvironmentById.mockResolvedValue({
			environmentId: "E",
			project: { organizationId: "org-1" },
		});
		mockUpdateChainOnce(moved);

		const result = await callMove("org-1").move({
			postgresId: "P",
			targetEnvironmentId: "E",
		});

		expect(result).toEqual(moved);
		expect(mockDbUpdate).toHaveBeenCalledTimes(1);
		expect(mockAudit).toHaveBeenCalledTimes(1);
	});
});

// Shared factory that exercises G1–G3 (source cross-org reject, target
// cross-org reject, same-org succeed) for one router's `move`. Keeps the six
// sibling routers covered without copy-pasting the three-case body each time.
const runCrossOrgGuardCases = (options: {
	name: string;
	router: ReturnType<typeof libsqlRouter.createCaller> extends never
		? never
		: {
				createCaller: (ctx: never) => {
					move: (input: unknown) => Promise<unknown>;
				};
			};
	idKey: string;
	findById: ReturnType<typeof mockFindLibsqlById>;
	movedRow: Record<string, unknown>;
}) => {
	const { name, router, idKey, findById, movedRow } = options;
	const callMove = (orgId: string) =>
		router.createCaller(buildCtx(orgId) as never);

	describe(`${name}.move — same cross-organization guard`, () => {
		it("rejects when the source service belongs to another organization", async () => {
			findById.mockResolvedValue({
				[idKey]: "S",
				environment: { project: { organizationId: "org-other" } },
			});

			await expect(
				callMove("org-1").move({ [idKey]: "S", targetEnvironmentId: "E" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			expect(mockFindEnvironmentById).not.toHaveBeenCalled();
			expect(mockDbUpdate).not.toHaveBeenCalled();
			expect(mockAudit).not.toHaveBeenCalled();
		});

		it("rejects when the target environment belongs to another organization", async () => {
			findById.mockResolvedValue({
				[idKey]: "S",
				environment: { project: { organizationId: "org-1" } },
			});
			mockFindEnvironmentById.mockResolvedValue({
				environmentId: "E",
				project: { organizationId: "org-other" },
			});

			await expect(
				callMove("org-1").move({ [idKey]: "S", targetEnvironmentId: "E" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			expect(mockDbUpdate).not.toHaveBeenCalled();
			expect(mockAudit).not.toHaveBeenCalled();
		});

		it("moves the service when both source and target are in the active org", async () => {
			findById.mockResolvedValue({
				[idKey]: "S",
				environment: { project: { organizationId: "org-1" } },
			});
			mockFindEnvironmentById.mockResolvedValue({
				environmentId: "E",
				project: { organizationId: "org-1" },
			});
			mockUpdateChainOnce(movedRow);

			const result = await callMove("org-1").move({
				[idKey]: "S",
				targetEnvironmentId: "E",
			});

			expect(result).toEqual(movedRow);
			expect(mockDbUpdate).toHaveBeenCalledTimes(1);
			expect(mockAudit).toHaveBeenCalledTimes(1);
		});
	});
};

runCrossOrgGuardCases({
	name: "redis",
	router: redisRouter as never,
	idKey: "redisId",
	findById: mockFindRedisById,
	movedRow: { redisId: "S", appName: "a", environmentId: "E" },
});

runCrossOrgGuardCases({
	name: "mongo",
	router: mongoRouter as never,
	idKey: "mongoId",
	findById: mockFindMongoById,
	movedRow: { mongoId: "S", appName: "a", environmentId: "E" },
});

runCrossOrgGuardCases({
	name: "mysql",
	router: mysqlRouter as never,
	idKey: "mysqlId",
	findById: mockFindMySqlById,
	movedRow: { mysqlId: "S", appName: "a", environmentId: "E" },
});

runCrossOrgGuardCases({
	name: "mariadb",
	router: mariadbRouter as never,
	idKey: "mariadbId",
	findById: mockFindMariadbById,
	movedRow: { mariadbId: "S", appName: "a", environmentId: "E" },
});

runCrossOrgGuardCases({
	name: "compose",
	router: composeRouter as never,
	idKey: "composeId",
	findById: mockFindComposeById,
	movedRow: { composeId: "S", name: "a", environmentId: "E" },
});

runCrossOrgGuardCases({
	name: "application",
	router: applicationRouter as never,
	idKey: "applicationId",
	findById: mockFindApplicationById,
	movedRow: { applicationId: "S", appName: "a", environmentId: "E" },
});
