import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteShellArg = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const createUpdateChain = () => ({
	set: vi.fn(() => ({
		where: vi.fn(async () => undefined),
	})),
});

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	dbTransaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
		callback({
			update: vi.fn(() => createUpdateChain()),
		}),
	),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findRedisById: vi.fn(),
	getServiceContainerCommand: vi.fn(
		(appName: string) =>
			`docker ps -q --filter "label=com.docker.swarm.service.name=${appName}" | head -n 1`,
	),
	noop: vi.fn(),
	quoteShellArg: vi.fn((value: string) => quoteShellArg(value)),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	checkPortInUse: mocks.noop,
	createMariadb: mocks.noop,
	createMount: mocks.noop,
	createMysql: mocks.noop,
	createMongo: mocks.noop,
	createPostgres: mocks.noop,
	createRedis: mocks.noop,
	deployMariadb: mocks.noop,
	deployMongo: mocks.noop,
	deployMySql: mocks.noop,
	deployPostgres: mocks.noop,
	deployRedis: mocks.noop,
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	findApplicationById: mocks.findApplicationById,
	findBackupsByDbId: mocks.noop,
	findComposeById: mocks.findComposeById,
	findEnvironmentById: mocks.noop,
	findLibsqlById: mocks.findLibsqlById,
	findMariadbById: mocks.findMariadbById,
	findMongoById: mocks.findMongoById,
	findMySqlById: mocks.findMySqlById,
	findPostgresById: mocks.findPostgresById,
	findProjectById: mocks.noop,
	findRedisById: mocks.findRedisById,
	getAccessibleServerIds: mocks.noop,
	getContainerLogs: mocks.noop,
	getMountPath: mocks.noop,
	getServiceContainerCommand: mocks.getServiceContainerCommand,
	getWebServerSettings: mocks.noop,
	quoteShellArg: mocks.quoteShellArg,
	rebuildDatabase: mocks.noop,
	removeMariadbById: mocks.noop,
	removeMongoById: mocks.noop,
	removeMySqlById: mocks.noop,
	removePostgresById: mocks.noop,
	removeRedisById: mocks.noop,
	removeService: mocks.noop,
	startService: mocks.noop,
	startServiceRemote: mocks.noop,
	stopService: mocks.noop,
	stopServiceRemote: mocks.noop,
	updateMariadbById: mocks.noop,
	updateMongoById: mocks.noop,
	updateMySqlById: mocks.noop,
	updatePostgresById: mocks.noop,
	updateRedisById: mocks.noop,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: mocks.dbTransaction,
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewService: mocks.noop,
	checkServiceAccess: mocks.noop,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: mocks.noop,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { postgresRouter } = await import("../../server/api/routers/postgres");
const { mysqlRouter } = await import("../../server/api/routers/mysql");
const { mariadbRouter } = await import("../../server/api/routers/mariadb");
const { mongoRouter } = await import("../../server/api/routers/mongo");
const { redisRouter } = await import("../../server/api/routers/redis");
const { apiCreateMongo, apiCreateRedis } = await import(
	"@dokploy/server/db/schema"
);

const createContext = () =>
	({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "admin",
		},
	}) as never;

const callers = () => ({
	mariadb: mariadbRouter.createCaller(createContext()),
	mongo: mongoRouter.createCaller(createContext()),
	mysql: mysqlRouter.createCaller(createContext()),
	postgres: postgresRouter.createCaller(createContext()),
	redis: redisRouter.createCaller(createContext()),
});

describe("database change-password command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.findPostgresById.mockResolvedValue({
			appName: "postgres-app",
			databaseUser: "dokploy",
			serverId: "server-1",
		});
		mocks.findMySqlById.mockResolvedValue({
			appName: "mysql-app",
			databaseRootPassword: "root-password",
			databaseUser: "dokploy",
			serverId: "server-1",
		});
		mocks.findMariadbById.mockResolvedValue({
			appName: "mariadb-app",
			databaseRootPassword: "root-password",
			databaseUser: "dokploy",
			serverId: "server-1",
		});
		mocks.findMongoById.mockResolvedValue({
			appName: "mongo-app",
			databasePassword: "mongo-password",
			databaseUser: "dokploy",
			serverId: "server-1",
		});
		mocks.findRedisById.mockResolvedValue({
			appName: "redis-app",
			databasePassword: "redis-password",
			serverId: "server-1",
		});
	});

	it("rejects unsafe redis and mongo credential fields before persistence", () => {
		expect(
			apiCreateRedis.safeParse({
				databasePassword: "safe;unsafe",
				dockerImage: "redis:8",
				environmentId: "env-1",
				name: "redis",
			}).success,
		).toBe(false);

		expect(
			apiCreateMongo.safeParse({
				databasePassword: "safePassword123",
				databaseUser: "mongo;id",
				dockerImage: "mongo:8",
				environmentId: "env-1",
				name: "mongo",
				replicaSets: false,
			}).success,
		).toBe(false);
	});

	it("rejects shell metacharacters in new database passwords before command execution", async () => {
		for (const password of ["safe;unsafe", "safe`unsafe"]) {
			await expect(
				callers().postgres.changePassword({
					postgresId: "postgres-1",
					password,
				}),
			).rejects.toThrow();
			await expect(
				callers().mysql.changePassword({
					mysqlId: "mysql-1",
					password,
				}),
			).rejects.toThrow();
			await expect(
				callers().mariadb.changePassword({
					mariadbId: "mariadb-1",
					password,
				}),
			).rejects.toThrow();
			await expect(
				callers().mongo.changePassword({
					mongoId: "mongo-1",
					password,
				}),
			).rejects.toThrow();
			await expect(
				callers().redis.changePassword({
					redisId: "redis-1",
					password,
				}),
			).rejects.toThrow();
		}

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("quotes postgres database user as a shell arg and SQL identifier", async () => {
		const databaseUser = "dokploy_user";
		mocks.findPostgresById.mockResolvedValue({
			appName: "postgres-app",
			databaseUser,
			serverId: "server-1",
		});

		await expect(
			callers().postgres.changePassword({
				postgresId: "postgres-1",
				password: "safePassword123",
			}),
		).resolves.toBe(true);

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		const postgresSql =
			"ALTER USER \"dokploy_user\" WITH PASSWORD 'safePassword123';";
		expect(command).toContain(`psql -U ${quoteShellArg(databaseUser)} -c`);
		expect(command).toContain(quoteShellArg(postgresSql));
		expect(command).not.toContain(`psql -U ${databaseUser}`);
		expect(command).not.toContain(`ALTER USER \\"${databaseUser}\\"`);
	});

	it("quotes mysql root password and SQL user/password literals", async () => {
		const databaseRootPassword = "root'; SELECT 1; --";
		const databaseUser = "dokploy_user";
		mocks.findMySqlById.mockResolvedValue({
			appName: "mysql-app",
			databaseRootPassword,
			databaseUser,
			serverId: "server-1",
		});

		await expect(
			callers().mysql.changePassword({
				mysqlId: "mysql-1",
				password: "safePassword123",
				type: "user",
			}),
		).resolves.toBe(true);

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		const mysqlSql =
			"ALTER USER 'dokploy_user'@'%' IDENTIFIED BY 'safePassword123'; FLUSH PRIVILEGES;";
		expect(command).toContain(
			`mysql -u root ${quoteShellArg(`-p${databaseRootPassword}`)} -e`,
		);
		expect(command).toContain(quoteShellArg(mysqlSql));
		expect(command).not.toContain(`-p'${databaseRootPassword}'`);
		expect(command).not.toContain(`ALTER USER '${databaseUser}'@'%'`);
	});

	it("quotes mariadb root password and SQL user/password literals", async () => {
		const databaseRootPassword = "root'; SELECT 1; --";
		const databaseUser = "dokploy_user";
		mocks.findMariadbById.mockResolvedValue({
			appName: "mariadb-app",
			databaseRootPassword,
			databaseUser,
			serverId: "server-1",
		});

		await expect(
			callers().mariadb.changePassword({
				mariadbId: "mariadb-1",
				password: "safePassword123",
				type: "user",
			}),
		).resolves.toBe(true);

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		const mariadbSql =
			"ALTER USER 'dokploy_user'@'%' IDENTIFIED BY 'safePassword123'; FLUSH PRIVILEGES;";
		expect(command).toContain(
			`mariadb -u root ${quoteShellArg(`-p${databaseRootPassword}`)} -e`,
		);
		expect(command).toContain(quoteShellArg(mariadbSql));
		expect(command).not.toContain(`-p'${databaseRootPassword}'`);
		expect(command).not.toContain(`ALTER USER '${databaseUser}'@'%'`);
	});

	it("quotes redis current and new passwords as shell args", async () => {
		const databasePassword = "old'; touch /tmp/pwn; '";
		const password = "safe|stillAllowed";
		mocks.findRedisById.mockResolvedValue({
			appName: "redis-app",
			databasePassword,
			serverId: "server-1",
		});

		await expect(
			callers().redis.changePassword({
				redisId: "redis-1",
				password,
			}),
		).resolves.toBe(true);

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(command).toContain(
			`redis-cli -a ${quoteShellArg(databasePassword)} CONFIG SET requirepass ${quoteShellArg(password)}`,
		);
		expect(command).not.toContain(`-a '${databasePassword}'`);
		expect(command).not.toContain(`requirepass ${password}`);
	});

	it("quotes mongo credentials and JavaScript eval literals", async () => {
		const databaseUser = "dokploy_user";
		const databasePassword = "old'; touch /tmp/pwn; '";
		const password = "safe|stillAllowed";
		mocks.findMongoById.mockResolvedValue({
			appName: "mongo-app",
			databasePassword,
			databaseUser,
			serverId: "server-1",
		});

		await expect(
			callers().mongo.changePassword({
				mongoId: "mongo-1",
				password,
			}),
		).resolves.toBe(true);

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		const js =
			'db.getSiblingDB("admin").changeUserPassword("dokploy_user", "safe|stillAllowed")';
		expect(command).toContain(`mongosh -u ${quoteShellArg(databaseUser)}`);
		expect(command).toContain(`-p ${quoteShellArg(databasePassword)}`);
		expect(command).toContain(`--eval ${quoteShellArg(js)}`);
		expect(command).not.toContain(`-p '${databasePassword}'`);
		expect(command).not.toContain(
			`changeUserPassword("${databaseUser}", ${password})`,
		);
		expect(command).not.toContain(`changeUserPassword('${databaseUser}'`);
	});

	it("rejects unsafe stored database users before command execution", async () => {
		const unsafeDatabaseUser = "dokploy\\'; SELECT 1; --";

		mocks.findPostgresById.mockResolvedValue({
			appName: "postgres-app",
			databaseUser: unsafeDatabaseUser,
			serverId: "server-1",
		});
		await expect(
			callers().postgres.changePassword({
				postgresId: "postgres-1",
				password: "safePassword123",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();

		vi.clearAllMocks();
		mocks.findMySqlById.mockResolvedValue({
			appName: "mysql-app",
			databaseRootPassword: "root-password",
			databaseUser: unsafeDatabaseUser,
			serverId: "server-1",
		});
		await expect(
			callers().mysql.changePassword({
				mysqlId: "mysql-1",
				password: "safePassword123",
				type: "user",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();

		vi.clearAllMocks();
		mocks.findMariadbById.mockResolvedValue({
			appName: "mariadb-app",
			databaseRootPassword: "root-password",
			databaseUser: unsafeDatabaseUser,
			serverId: "server-1",
		});
		await expect(
			callers().mariadb.changePassword({
				mariadbId: "mariadb-1",
				password: "safePassword123",
				type: "user",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});
});
