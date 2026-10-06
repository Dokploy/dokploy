import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	studioFindFirst: vi.fn(),
	postgresFindMany: vi.fn(),
	mysqlFindMany: vi.fn(),
	mariadbFindMany: vi.fn(),
	mongoFindMany: vi.fn(),
	redisFindMany: vi.fn(),
	libsqlFindMany: vi.fn(),
	networkFindMany: vi.fn(),
	updateSet: vi.fn(),
	updateReturning: vi.fn(),
	writeStudioSeed: vi.fn(),
	removeStudioSeedDirectory: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			libredbStudio: { findFirst: mocks.studioFindFirst },
			postgres: { findMany: mocks.postgresFindMany },
			mysql: { findMany: mocks.mysqlFindMany },
			mariadb: { findMany: mocks.mariadbFindMany },
			mongo: { findMany: mocks.mongoFindMany },
			redis: { findMany: mocks.redisFindMany },
			libsql: { findMany: mocks.libsqlFindMany },
			network: { findMany: mocks.networkFindMany },
		},
		update: vi.fn(() => ({
			set: (values: Record<string, unknown>) => {
				mocks.updateSet(values);
				return {
					where: () =>
						Object.assign(Promise.resolve(undefined), {
							returning: mocks.updateReturning,
						}),
				};
			},
		})),
	},
}));

vi.mock("@dokploy/server/utils/libredb-studio/writer", () => ({
	writeStudioSeed: mocks.writeStudioSeed,
	removeStudioSeedDirectory: mocks.removeStudioSeedDirectory,
}));

const { loadLibreDBStudioScope, loadStudioDatabases, runLibreDBStudioSync } =
	await import("@dokploy/server/utils/libredb-studio/sync");
const { hashSeedContent } = await import(
	"@dokploy/server/utils/libredb-studio/seed"
);

const EMPTY_CONTENT_HASH =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const shared = {
	serverId: null,
	networkIds: [],
	detachDokployNetwork: false,
	networkSwarm: null,
	applicationStatus: "done",
};

const studioColumns = (overrides: Record<string, unknown> = {}) => ({
	libredbStudioId: "studio-1",
	applicationId: "app-1",
	allowCustomConnections: false,
	seedHash: null,
	lastSyncedAt: null,
	lastSyncError: null,
	launchSecret: "test-launch-secret-of-studio-1",
	jwtSecret: "test-jwt-secret-of-studio-1",
	adminPassword: "test-admin-password-of-studio-1",
	createdAt: "2026-10-03T00:00:00.000Z",
	...overrides,
});

const studioRow = (overrides: Record<string, unknown> = {}) => ({
	...studioColumns(overrides),
	application: {
		applicationId: "app-1",
		appName: "demo-shop-libredb-studio-x1y2z3",
		name: "LibreDB Studio",
		serverId: null,
		environmentId: "env-1",
		networkIds: [],
		environment: { name: "production", project: { name: "Demo Shop" } },
	},
});

const lastSet = () => mocks.updateSet.mock.calls.at(-1)?.[0];

// The scope is read without a columns filter, while the check that runs
// around a write selects columns, which is how the two reads are told apart.
// A null current row means the Studio was deleted after its scope was read,
// so that check and the updates that record the outcome find no row.
const serveStudio = (
	studio: Record<string, unknown> | undefined,
	current: Record<string, unknown> | null = studio
		? { libredbStudioId: "studio-1", application: { serverId: null } }
		: null,
) => {
	mocks.studioFindFirst.mockImplementation(
		async (query: { columns?: Record<string, boolean> }) =>
			query.columns ? (current ?? undefined) : studio,
	);
	mocks.updateReturning.mockImplementation(async () =>
		current ? [{ ...studioColumns(), ...lastSet() }] : [],
	);
};

const postgresRow = (overrides: Record<string, unknown> = {}) => ({
	...shared,
	postgresId: "pg-1",
	name: "Orders DB",
	appName: "demo-shop-orders-db-e6qmrw",
	databaseName: "orders",
	databaseUser: "orders",
	databasePassword: "orders-pass",
	...overrides,
});

const noDatabases = () => {
	for (const findMany of [
		mocks.postgresFindMany,
		mocks.mysqlFindMany,
		mocks.mariadbFindMany,
		mocks.mongoFindMany,
		mocks.redisFindMany,
		mocks.libsqlFindMany,
	]) {
		findMany.mockResolvedValue([]);
	}
};

beforeEach(() => {
	vi.clearAllMocks();
	noDatabases();
	mocks.networkFindMany.mockResolvedValue([]);
	serveStudio(studioRow());
	mocks.writeStudioSeed.mockResolvedValue(undefined);
	mocks.removeStudioSeedDirectory.mockResolvedValue(undefined);
});

describe("loadStudioDatabases", () => {
	it("maps a row of every kind to a StudioDatabase", async () => {
		mocks.postgresFindMany.mockResolvedValue([
			postgresRow({ networkIds: ["net-1"], detachDokployNetwork: true }),
		]);
		mocks.mysqlFindMany.mockResolvedValue([
			{
				...shared,
				mysqlId: "my-1",
				name: "Legacy MySQL",
				appName: "demo-shop-legacy-mysql-a1b2c3",
				databaseName: "legacy",
				databaseUser: "root",
				databasePassword: "user-pass",
				databaseRootPassword: "root-pass",
			},
		]);
		mocks.mariadbFindMany.mockResolvedValue([
			{
				...shared,
				mariadbId: "maria-1",
				name: "Shop MariaDB",
				appName: "demo-shop-shop-mariadb-d4e5f6",
				databaseName: "shop",
				databaseUser: "shop",
				databasePassword: "maria-pass",
				databaseRootPassword: "maria-root",
				applicationStatus: "idle",
			},
		]);
		mocks.mongoFindMany.mockResolvedValue([
			{
				...shared,
				mongoId: "mongo-1",
				name: "Events Mongo",
				appName: "demo-shop-events-mongo-g7h8i9",
				databaseUser: "mongo",
				databasePassword: "mongo-pass",
				serverId: "server-2",
			},
		]);
		mocks.redisFindMany.mockResolvedValue([
			{
				...shared,
				redisId: "redis-1",
				name: "Cache",
				appName: "demo-shop-cache-j1k2l3",
				databasePassword: "redis-pass",
				networkSwarm: [{ Target: "custom-net" }],
			},
		]);
		mocks.libsqlFindMany.mockResolvedValue([
			{
				...shared,
				libsqlId: "libsql-1",
				name: "Edge libSQL",
				appName: "demo-shop-edge-libsql-m4n5o6",
				databaseUser: "libsql",
				databasePassword: "libsql-pass",
				sqldNode: "replica",
				networkIds: null,
				networkSwarm: [],
				applicationStatus: "error",
			},
		]);

		const databases = await loadStudioDatabases("env-1");

		expect(databases).toEqual([
			{
				kind: "postgres",
				id: "pg-1",
				name: "Orders DB",
				appName: "demo-shop-orders-db-e6qmrw",
				serverId: null,
				databaseName: "orders",
				databaseUser: "orders",
				databasePassword: "orders-pass",
				databaseRootPassword: null,
				sqldNode: null,
				networkIds: ["net-1"],
				detachDokployNetwork: true,
				hasNetworkSwarm: false,
				applicationStatus: "done",
			},
			{
				kind: "mysql",
				id: "my-1",
				name: "Legacy MySQL",
				appName: "demo-shop-legacy-mysql-a1b2c3",
				serverId: null,
				databaseName: "legacy",
				databaseUser: "root",
				databasePassword: "user-pass",
				databaseRootPassword: "root-pass",
				sqldNode: null,
				networkIds: [],
				detachDokployNetwork: false,
				hasNetworkSwarm: false,
				applicationStatus: "done",
			},
			{
				kind: "mariadb",
				id: "maria-1",
				name: "Shop MariaDB",
				appName: "demo-shop-shop-mariadb-d4e5f6",
				serverId: null,
				databaseName: "shop",
				databaseUser: "shop",
				databasePassword: "maria-pass",
				databaseRootPassword: "maria-root",
				sqldNode: null,
				networkIds: [],
				detachDokployNetwork: false,
				hasNetworkSwarm: false,
				applicationStatus: "idle",
			},
			{
				kind: "mongo",
				id: "mongo-1",
				name: "Events Mongo",
				appName: "demo-shop-events-mongo-g7h8i9",
				serverId: "server-2",
				databaseName: null,
				databaseUser: "mongo",
				databasePassword: "mongo-pass",
				databaseRootPassword: null,
				sqldNode: null,
				networkIds: [],
				detachDokployNetwork: false,
				hasNetworkSwarm: false,
				applicationStatus: "done",
			},
			{
				kind: "redis",
				id: "redis-1",
				name: "Cache",
				appName: "demo-shop-cache-j1k2l3",
				serverId: null,
				databaseName: null,
				databaseUser: null,
				databasePassword: "redis-pass",
				databaseRootPassword: null,
				sqldNode: null,
				networkIds: [],
				detachDokployNetwork: false,
				hasNetworkSwarm: true,
				applicationStatus: "done",
			},
			{
				kind: "libsql",
				id: "libsql-1",
				name: "Edge libSQL",
				appName: "demo-shop-edge-libsql-m4n5o6",
				serverId: null,
				databaseName: null,
				databaseUser: "libsql",
				databasePassword: "libsql-pass",
				databaseRootPassword: null,
				sqldNode: "replica",
				networkIds: [],
				detachDokployNetwork: false,
				hasNetworkSwarm: true,
				applicationStatus: "error",
			},
		]);
	});
});

describe("loadLibreDBStudioScope", () => {
	it("joins the Studio, its application, the labels and the overlay networks", async () => {
		mocks.postgresFindMany.mockResolvedValue([
			postgresRow({ networkIds: ["net-1"], detachDokployNetwork: true }),
		]);
		mocks.networkFindMany.mockResolvedValue([
			{ networkId: "net-1", serverId: null, driver: "overlay" },
		]);

		const scope = await loadLibreDBStudioScope("studio-1");

		expect(scope.studio).toEqual({
			libredbStudioId: "studio-1",
			applicationId: "app-1",
			allowCustomConnections: false,
			seedHash: null,
			lastSyncedAt: null,
			lastSyncError: null,
			launchSecret: "test-launch-secret-of-studio-1",
			jwtSecret: "test-jwt-secret-of-studio-1",
			adminPassword: "test-admin-password-of-studio-1",
			createdAt: "2026-10-03T00:00:00.000Z",
		});
		expect(scope.application).toEqual({
			applicationId: "app-1",
			appName: "demo-shop-libredb-studio-x1y2z3",
			name: "LibreDB Studio",
			serverId: null,
			environmentId: "env-1",
			networkIds: [],
		});
		expect(scope.labels).toEqual({
			projectName: "Demo Shop",
			environmentName: "production",
		});
		expect(scope.databases.map((database) => database.id)).toEqual(["pg-1"]);
		expect(scope.coverage.covered.map((database) => database.id)).toEqual([
			"pg-1",
		]);
		expect(scope.coverage.requiredNetworkIds).toEqual(["net-1"]);
		expect(mocks.networkFindMany).toHaveBeenCalledTimes(1);
	});

	it("skips the network query when no database uses a custom network", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);

		await loadLibreDBStudioScope("studio-1");

		expect(mocks.networkFindMany).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the Studio row is gone", async () => {
		serveStudio(undefined);

		await expect(loadLibreDBStudioScope("studio-1")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("runLibreDBStudioSync", () => {
	it("writes the rendered seed and records the hash on the first sync", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);

		const result = await runLibreDBStudioSync("studio-1");

		expect(result.changed).toBe(true);
		expect(mocks.writeStudioSeed).toHaveBeenCalledTimes(1);
		const written = mocks.writeStudioSeed.mock.calls[0]?.[0];
		expect(written).toMatchObject({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
		});
		expect(JSON.parse(written.content).connections).toHaveLength(1);
		expect(lastSet()).toEqual({
			seedHash: hashSeedContent(written.content),
			lastSyncedAt: expect.any(String),
			lastSyncError: null,
		});
		expect(result.scope.studio.seedHash).toBe(hashSeedContent(written.content));
	});

	it("skips the write when the content hash equals seedHash", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);
		await runLibreDBStudioSync("studio-1");
		const content = mocks.writeStudioSeed.mock.calls[0]?.[0].content;
		mocks.writeStudioSeed.mockClear();
		serveStudio(studioRow({ seedHash: hashSeedContent(content) }));

		const result = await runLibreDBStudioSync("studio-1");

		expect(result.changed).toBe(false);
		expect(mocks.writeStudioSeed).not.toHaveBeenCalled();
		expect(lastSet()).toEqual({
			seedHash: hashSeedContent(content),
			lastSyncedAt: expect.any(String),
			lastSyncError: null,
		});
	});

	it("writes an unchanged seed when forced", async () => {
		serveStudio(studioRow({ seedHash: EMPTY_CONTENT_HASH }));

		const result = await runLibreDBStudioSync("studio-1", { force: true });

		expect(result.changed).toBe(false);
		expect(mocks.writeStudioSeed).toHaveBeenCalledWith({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
			content: "",
		});
	});

	it("removes the seed file when no database is covered", async () => {
		mocks.postgresFindMany.mockResolvedValue([
			postgresRow({ serverId: "server-2" }),
		]);

		const result = await runLibreDBStudioSync("studio-1");

		expect(result.changed).toBe(true);
		expect(mocks.writeStudioSeed).toHaveBeenCalledWith({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
			content: "",
		});
		expect(lastSet()).toMatchObject({ seedHash: EMPTY_CONTENT_HASH });
	});

	it("leaves out a database with a reference-like user and writes the others", async () => {
		mocks.postgresFindMany.mockResolvedValue([
			postgresRow(),
			postgresRow({
				postgresId: "pg-2",
				name: "Billing DB",
				appName: "demo-shop-billing-db-p1q2r3",
				databaseUser: "${JWT_SECRET}",
			}),
		]);
		mocks.redisFindMany.mockResolvedValue([
			{
				...shared,
				redisId: "redis-1",
				name: "Cache",
				appName: "demo-shop-cache-j1k2l3",
				databasePassword: "redis-pass",
			},
		]);

		const result = await runLibreDBStudioSync("studio-1");

		expect(result.scope.coverage.excluded).toEqual([
			{
				database: expect.objectContaining({ id: "pg-2" }),
				reason: "reference-like-value",
			},
		]);
		const written = mocks.writeStudioSeed.mock.calls[0]?.[0];
		const connections: { name: string }[] = JSON.parse(
			written.content,
		).connections;
		expect(connections.map((connection) => connection.name)).toEqual([
			"Cache",
			"Orders DB",
		]);
		expect(written.content).not.toContain("JWT_SECRET");
		expect(written.content).not.toContain("Billing DB");
		expect(lastSet()).toEqual({
			seedHash: hashSeedContent(written.content),
			lastSyncedAt: expect.any(String),
			lastSyncError: null,
		});
	});

	it("records the error and rethrows when the write fails", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);
		mocks.writeStudioSeed.mockRejectedValue(new Error("disk full"));

		await expect(runLibreDBStudioSync("studio-1")).rejects.toThrow("disk full");
		expect(mocks.updateSet).toHaveBeenCalledTimes(1);
		expect(lastSet()).toEqual({ lastSyncError: "disk full" });
		expect(mocks.removeStudioSeedDirectory).not.toHaveBeenCalled();
	});

	it("records a validation failure without writing anything", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow({ name: "" })]);

		await expect(runLibreDBStudioSync("studio-1")).rejects.toThrow();
		expect(mocks.writeStudioSeed).not.toHaveBeenCalled();
		expect(lastSet()).toEqual({ lastSyncError: expect.any(String) });
	});

	it("clears a previous error after a successful sync", async () => {
		serveStudio(studioRow({ lastSyncError: "previous failure" }));

		const result = await runLibreDBStudioSync("studio-1");

		expect(lastSet()).toMatchObject({ lastSyncError: null });
		expect(result.scope.studio.lastSyncError).toBeNull();
	});

	it("rejects with NOT_FOUND and writes nothing when the Studio is gone", async () => {
		serveStudio(undefined);

		const error = await runLibreDBStudioSync("studio-1").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error).toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.writeStudioSeed).not.toHaveBeenCalled();
		expect(mocks.removeStudioSeedDirectory).not.toHaveBeenCalled();
	});

	it("removes what it wrote when the Studio is deleted during the write", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);
		serveStudio(studioRow(), null);

		const error = await runLibreDBStudioSync("studio-1").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error).toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.removeStudioSeedDirectory).toHaveBeenCalledWith({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
		});
		expect(
			mocks.removeStudioSeedDirectory.mock.invocationCallOrder[0],
		).toBeGreaterThan(mocks.writeStudioSeed.mock.invocationCallOrder[0] ?? 0);
		expect(mocks.updateSet).not.toHaveBeenCalledWith(
			expect.objectContaining({ lastSyncError: null }),
		);
	});

	it("removes what is left and rejects with NOT_FOUND when the deletion makes the write fail", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);
		serveStudio(studioRow(), null);
		mocks.writeStudioSeed.mockRejectedValue(
			new Error("ENOENT: no such file or directory, rename"),
		);

		const error = await runLibreDBStudioSync("studio-1").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error).toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.removeStudioSeedDirectory).toHaveBeenCalledWith({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
		});
	});

	it("rejects with NOT_FOUND instead of its own failure when the Studio was deleted meanwhile", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow({ name: "" })]);
		serveStudio(studioRow(), null);

		const error = await runLibreDBStudioSync("studio-1").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(TRPCError);
		expect(error).toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.writeStudioSeed).not.toHaveBeenCalled();
		expect(mocks.removeStudioSeedDirectory).not.toHaveBeenCalled();
	});

	it("removes what it wrote when the Studio moves to another server during the write", async () => {
		mocks.postgresFindMany.mockResolvedValue([postgresRow()]);
		serveStudio(studioRow(), {
			libredbStudioId: "studio-1",
			application: { serverId: "server-9" },
		});

		await expect(runLibreDBStudioSync("studio-1")).rejects.toThrow(
			"moved to another server",
		);
		expect(mocks.removeStudioSeedDirectory).toHaveBeenCalledWith({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
		});
		expect(lastSet()).toEqual({
			lastSyncError: expect.stringContaining("moved"),
		});
	});

	it("runs two concurrent syncs of one Studio one after the other", async () => {
		const events: string[] = [];
		let releaseFirstWrite: () => void = () => undefined;
		mocks.studioFindFirst.mockImplementation(
			async (query: { columns?: Record<string, boolean> }) => {
				if (query.columns) {
					return {
						libredbStudioId: "studio-1",
						application: { serverId: null },
					};
				}
				events.push("load");
				return studioRow();
			},
		);
		mocks.writeStudioSeed
			.mockImplementationOnce(async () => {
				events.push("write-1-start");
				await new Promise<void>((resolve) => {
					releaseFirstWrite = resolve;
				});
				events.push("write-1-end");
			})
			.mockImplementationOnce(async () => {
				events.push("write-2");
			});

		const first = runLibreDBStudioSync("studio-1");
		const second = runLibreDBStudioSync("studio-1");
		await vi.waitFor(() => expect(events).toContain("write-1-start"));
		expect(events).toEqual(["load", "write-1-start"]);

		releaseFirstWrite();
		await Promise.all([first, second]);

		expect(events).toEqual([
			"load",
			"write-1-start",
			"write-1-end",
			"load",
			"write-2",
		]);
	});

	it("keeps serving the chain after a failed sync", async () => {
		mocks.writeStudioSeed.mockRejectedValueOnce(new Error("ssh down"));

		const failed = runLibreDBStudioSync("studio-1");
		const next = runLibreDBStudioSync("studio-1");

		await expect(failed).rejects.toThrow("ssh down");
		await expect(next).resolves.toMatchObject({ changed: true });
	});
});

describe("the sync chain shared by every copy of the module", () => {
	it("makes a sync on a second copy wait for the pending one on the first", async () => {
		const events: string[] = [];
		let releaseFirstWrite: () => void = () => undefined;
		mocks.writeStudioSeed
			.mockImplementationOnce(async () => {
				events.push("write-1-start");
				await new Promise<void>((resolve) => {
					releaseFirstWrite = resolve;
				});
				events.push("write-1-end");
			})
			.mockImplementationOnce(async () => {
				events.push("write-2");
			});
		vi.resetModules();
		const secondCopy = await import(
			"@dokploy/server/utils/libredb-studio/sync"
		);
		expect(secondCopy.runLibreDBStudioSync).not.toBe(runLibreDBStudioSync);

		const first = runLibreDBStudioSync("studio-1");
		await vi.waitFor(() => expect(events).toEqual(["write-1-start"]));
		const second = secondCopy.runLibreDBStudioSync("studio-1");
		// Waiting for one macrotask lets every microtask run, so a sync that was
		// not queued behind the first one would have reached its write by then.
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(events).toEqual(["write-1-start"]);
		releaseFirstWrite();
		await Promise.all([first, second]);
		expect(events).toEqual(["write-1-start", "write-1-end", "write-2"]);
	});
});
