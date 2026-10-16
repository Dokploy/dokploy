import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const returning = vi.fn();
	const chain = {
		set: () => chain,
		where: () => chain,
		values: () => chain,
		returning,
	};
	return {
		chain,
		returning,
		findFirst: vi.fn(),
		schedule: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: vi.fn(() => mocks.chain),
		update: vi.fn(() => mocks.chain),
		delete: vi.fn(() => mocks.chain),
		query: new Proxy(
			{},
			{
				get: () => ({
					findFirst: mocks.findFirst,
					findMany: vi.fn(async () => []),
				}),
			},
		),
	},
}));

vi.mock("@dokploy/server/services/libredb-studio", () => ({
	scheduleLibreDBStudioSync: mocks.schedule,
}));

const { createPostgres, removePostgresById, updatePostgresById } = await import(
	"@dokploy/server/services/postgres"
);
const { createMysql, removeMySqlById, updateMySqlById } = await import(
	"@dokploy/server/services/mysql"
);
const { createMariadb, removeMariadbById, updateMariadbById } = await import(
	"@dokploy/server/services/mariadb"
);
const { createMongo, removeMongoById, updateMongoById } = await import(
	"@dokploy/server/services/mongo"
);
const { createRedis, removeRedisById, updateRedisById } = await import(
	"@dokploy/server/services/redis"
);
const { createLibsql, removeLibsqlById, updateLibsqlById } = await import(
	"@dokploy/server/services/libsql"
);

type RowUpdate = {
	environmentId?: string;
	serverId?: string | null;
	name?: string;
};

const base = {
	name: "Orders DB",
	appName: "orders-db",
	dockerImage: "image:latest",
	environmentId: "env-1",
	description: "",
};

const kinds = [
	{
		kind: "postgres",
		create: () =>
			createPostgres({
				...base,
				databaseName: "orders",
				databaseUser: "orders",
				databasePassword: "orders-pass",
			}),
		update: (data: RowUpdate) => updatePostgresById("db-1", data),
		remove: () => removePostgresById("db-1"),
	},
	{
		kind: "mysql",
		create: () =>
			createMysql({
				...base,
				databaseName: "orders",
				databaseUser: "orders",
				databasePassword: "orders-pass",
				databaseRootPassword: "root-pass",
			}),
		update: (data: RowUpdate) => updateMySqlById("db-1", data),
		remove: () => removeMySqlById("db-1"),
	},
	{
		kind: "mariadb",
		create: () =>
			createMariadb({
				...base,
				databaseName: "orders",
				databaseUser: "orders",
				databasePassword: "orders-pass",
				databaseRootPassword: "root-pass",
			}),
		update: (data: RowUpdate) => updateMariadbById("db-1", data),
		remove: () => removeMariadbById("db-1"),
	},
	{
		kind: "mongo",
		create: () =>
			createMongo({
				...base,
				databaseUser: "orders",
				databasePassword: "orders-pass",
			}),
		update: (data: RowUpdate) => updateMongoById("db-1", data),
		remove: () => removeMongoById("db-1"),
	},
	{
		kind: "redis",
		create: () => createRedis({ ...base, databasePassword: "orders-pass" }),
		update: (data: RowUpdate) => updateRedisById("db-1", data),
		remove: () => removeRedisById("db-1"),
	},
	{
		kind: "libsql",
		create: () =>
			createLibsql({
				...base,
				databaseUser: "orders",
				databasePassword: "orders-pass",
				sqldNode: "primary",
				sqldPrimaryUrl: null,
				enableNamespaces: false,
				serverId: "server-2",
			}),
		update: (data: RowUpdate) => updateLibsqlById("db-1", data),
		remove: () => removeLibsqlById("db-1"),
	},
];

beforeEach(() => {
	vi.clearAllMocks();
});

describe.each(kinds)("$kind service triggers", ({ create, update, remove }) => {
	it("schedules a sync for the scope of a created database", async () => {
		const row = {
			environmentId: "env-1",
			serverId: "server-2",
			name: "Orders DB",
		};
		mocks.returning.mockResolvedValue([row]);

		await expect(create()).resolves.toBe(row);

		expect(mocks.schedule).toHaveBeenCalledTimes(1);
		expect(mocks.schedule).toHaveBeenCalledWith(
			expect.objectContaining({ environmentId: "env-1", serverId: "server-2" }),
		);
	});

	it("schedules only the current scope when the update keeps it", async () => {
		mocks.returning.mockResolvedValue([
			{ environmentId: "env-1", serverId: null, name: "Renamed" },
		]);

		await update({ name: "Renamed" });

		expect(mocks.findFirst).not.toHaveBeenCalled();
		expect(mocks.schedule).toHaveBeenCalledTimes(1);
		expect(mocks.schedule).toHaveBeenCalledWith(
			expect.objectContaining({ environmentId: "env-1", serverId: null }),
		);
	});

	it("schedules the previous and the new scope when the update moves it", async () => {
		mocks.findFirst.mockResolvedValue({
			environmentId: "env-1",
			serverId: null,
		});
		mocks.returning.mockResolvedValue([
			{ environmentId: "env-1", serverId: "server-2" },
		]);

		await update({ serverId: "server-2" });

		expect(mocks.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				columns: { environmentId: true, serverId: true },
			}),
		);
		expect(mocks.schedule).toHaveBeenNthCalledWith(1, {
			environmentId: "env-1",
			serverId: null,
		});
		expect(mocks.schedule).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ environmentId: "env-1", serverId: "server-2" }),
		);
	});

	it("schedules nothing when the update matched no row", async () => {
		mocks.returning.mockResolvedValue([]);

		await update({ name: "Renamed" });

		expect(mocks.schedule).not.toHaveBeenCalled();
	});

	it("schedules the scope of a removed database", async () => {
		mocks.returning.mockResolvedValue([
			{ environmentId: "env-1", serverId: null },
		]);

		await remove();

		expect(mocks.schedule).toHaveBeenCalledWith(
			expect.objectContaining({ environmentId: "env-1", serverId: null }),
		);
	});
});
