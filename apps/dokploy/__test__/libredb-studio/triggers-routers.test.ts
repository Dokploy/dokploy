import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const events: string[] = [];
	const updateReturning = vi.fn();
	const updateChain = {
		set: () => updateChain,
		where: () => updateChain,
		returning: updateReturning,
	};
	const findFirst = vi.fn();
	const db = {
		transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
			const result = await callback({ update: () => updateChain });
			events.push("transaction-committed");
			return result;
		}),
		update: vi.fn(() => updateChain),
		query: new Proxy({}, { get: () => ({ findFirst }) }),
	};
	return {
		db,
		events,
		findFirst,
		updateReturning,
		findDatabase: vi.fn(),
		execAsync: vi.fn(),
		schedule: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));
vi.mock("@/server/db", () => ({ db: mocks.db }));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	findPostgresById: mocks.findDatabase,
	findMySqlById: mocks.findDatabase,
	findMariadbById: mocks.findDatabase,
	findMongoById: mocks.findDatabase,
	findRedisById: mocks.findDatabase,
	getServiceContainer: vi.fn(async () => ({ Id: "container-1" })),
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsync,
	scheduleLibreDBStudioSync: mocks.schedule,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { postgresRouter } = await import("@/server/api/routers/postgres");
const { mysqlRouter } = await import("@/server/api/routers/mysql");
const { mariadbRouter } = await import("@/server/api/routers/mariadb");
const { mongoRouter } = await import("@/server/api/routers/mongo");
const { redisRouter } = await import("@/server/api/routers/redis");
const { libsqlRouter } = await import("@/server/api/routers/libsql");

const ctx = {
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof postgresRouter.createCaller>[0];

const password = "n3w-pass";

const changePasswordCases = [
	{
		kind: "postgres",
		change: () =>
			postgresRouter
				.createCaller(ctx)
				.changePassword({ postgresId: "db-1", password }),
	},
	{
		kind: "mysql",
		change: () =>
			mysqlRouter
				.createCaller(ctx)
				.changePassword({ mysqlId: "db-1", password, type: "root" }),
	},
	{
		kind: "mariadb",
		change: () =>
			mariadbRouter
				.createCaller(ctx)
				.changePassword({ mariadbId: "db-1", password, type: "user" }),
	},
	{
		kind: "mongo",
		change: () =>
			mongoRouter
				.createCaller(ctx)
				.changePassword({ mongoId: "db-1", password }),
	},
	{
		kind: "redis",
		change: () =>
			redisRouter
				.createCaller(ctx)
				.changePassword({ redisId: "db-1", password }),
	},
];

const moveCases = [
	{
		kind: "postgres",
		move: () =>
			postgresRouter
				.createCaller(ctx)
				.move({ postgresId: "db-1", targetEnvironmentId: "env-new" }),
	},
	{
		kind: "mysql",
		move: () =>
			mysqlRouter
				.createCaller(ctx)
				.move({ mysqlId: "db-1", targetEnvironmentId: "env-new" }),
	},
	{
		kind: "mariadb",
		move: () =>
			mariadbRouter
				.createCaller(ctx)
				.move({ mariadbId: "db-1", targetEnvironmentId: "env-new" }),
	},
	{
		kind: "mongo",
		move: () =>
			mongoRouter
				.createCaller(ctx)
				.move({ mongoId: "db-1", targetEnvironmentId: "env-new" }),
	},
	{
		kind: "redis",
		move: () =>
			redisRouter
				.createCaller(ctx)
				.move({ redisId: "db-1", targetEnvironmentId: "env-new" }),
	},
	{
		kind: "libsql",
		move: () =>
			libsqlRouter
				.createCaller(ctx)
				.move({ libsqlId: "db-1", targetEnvironmentId: "env-new" }),
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	mocks.events.length = 0;
	mocks.findDatabase.mockResolvedValue({
		appName: "orders-db",
		serverId: null,
		environmentId: "env-1",
		databaseUser: "orders",
		databasePassword: "old-pass",
		databaseRootPassword: "root-pass",
	});
	mocks.execAsync.mockImplementation(async () => {
		mocks.events.push("exec");
		return { stdout: "", stderr: "" };
	});
	mocks.schedule.mockImplementation(() => {
		mocks.events.push("schedule");
	});
});

describe.each(changePasswordCases)("$kind changePassword", ({ change }) => {
	it("schedules a sync after the password transaction resolves", async () => {
		await expect(change()).resolves.toBe(true);

		expect(mocks.events).toEqual(["exec", "transaction-committed", "schedule"]);
		expect(mocks.schedule).toHaveBeenCalledWith(
			expect.objectContaining({ environmentId: "env-1", serverId: null }),
		);
	});

	it("schedules nothing when the password change fails", async () => {
		mocks.execAsync.mockRejectedValue(new Error("container gone"));

		await expect(change()).rejects.toThrow("container gone");

		expect(mocks.schedule).not.toHaveBeenCalled();
	});
});

describe.each(moveCases)("$kind move", ({ move }) => {
	it("schedules the old and the new environment", async () => {
		mocks.findFirst.mockResolvedValue({
			environmentId: "env-old",
			serverId: "server-2",
		});
		mocks.updateReturning.mockResolvedValue([
			{ appName: "orders-db", environmentId: "env-new", serverId: "server-2" },
		]);

		await move();

		expect(mocks.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				columns: { environmentId: true, serverId: true },
			}),
		);
		expect(mocks.schedule).toHaveBeenNthCalledWith(1, {
			environmentId: "env-old",
			serverId: "server-2",
		});
		expect(mocks.schedule).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				environmentId: "env-new",
				serverId: "server-2",
			}),
		);
	});
});
