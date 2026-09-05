import { apiCreateMount, apiUpdateMount } from "@dokploy/server/db/schema";
import { rebuildDatabase } from "@dokploy/server/utils/databases/rebuild";
import { parse, quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DatabaseType =
	| "libsql"
	| "mariadb"
	| "mongo"
	| "mysql"
	| "postgres"
	| "redis";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	removeService: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	deployLibsql: vi.fn(),
	deployMariadb: vi.fn(),
	deployMongo: vi.fn(),
	deployMySql: vi.fn(),
	deployPostgres: vi.fn(),
	deployRedis: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			libsql: { findFirst: mocks.findFirst },
			mariadb: { findFirst: mocks.findFirst },
			mongo: { findFirst: mocks.findFirst },
			mysql: { findFirst: mocks.findFirst },
			postgres: { findFirst: mocks.findFirst },
			redis: { findFirst: mocks.findFirst },
		},
	},
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: mocks.removeService,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/services/libsql", () => ({
	deployLibsql: mocks.deployLibsql,
}));
vi.mock("@dokploy/server/services/mariadb", () => ({
	deployMariadb: mocks.deployMariadb,
}));
vi.mock("@dokploy/server/services/mongo", () => ({
	deployMongo: mocks.deployMongo,
}));
vi.mock("@dokploy/server/services/mysql", () => ({
	deployMySql: mocks.deployMySql,
}));
vi.mock("@dokploy/server/services/postgres", () => ({
	deployPostgres: mocks.deployPostgres,
}));
vi.mock("@dokploy/server/services/redis", () => ({
	deployRedis: mocks.deployRedis,
}));

const DEPLOY_BY_TYPE = {
	libsql: mocks.deployLibsql,
	mariadb: mocks.deployMariadb,
	mongo: mocks.deployMongo,
	mysql: mocks.deployMySql,
	postgres: mocks.deployPostgres,
	redis: mocks.deployRedis,
} as const;

const volumeMount = (volumeName: string | null) => ({
	type: "volume" as const,
	volumeName,
});

function setDatabase(
	input: {
		appName?: string;
		serverId?: string | null;
		mounts?: Array<Record<string, unknown>>;
	} = {},
) {
	const database = {
		appName: input.appName ?? "pg-app",
		serverId: input.serverId ?? null,
		mounts: input.mounts ?? [],
	};
	mocks.findFirst.mockResolvedValue(database);
	return database;
}

async function runRebuild(databaseId: string, type: DatabaseType) {
	const promise = rebuildDatabase(databaseId, type);
	await vi.advanceTimersByTimeAsync(6000);
	return promise;
}

describe("rebuildDatabase", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mocks.findFirst.mockResolvedValue(undefined);
		mocks.removeService.mockResolvedValue(undefined);
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		for (const fn of Object.values(DEPLOY_BY_TYPE))
			fn.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("skips volume mounts with a null/empty volumeName and still redeploys the database", async () => {
		setDatabase({
			mounts: [
				volumeMount("vol-1"),
				volumeMount(null),
				volumeMount(""),
				volumeMount("vol-2"),
				{ type: "bind", hostPath: "/host" },
				{ type: "file", filePath: "f.txt", content: "c" },
			],
		});

		await runRebuild("db-1", "postgres");

		expect(mocks.removeService).toHaveBeenCalledWith("pg-app", null);
		expect(mocks.execAsync).toHaveBeenCalledTimes(2);
		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			1,
			"docker volume rm vol-1 --force",
		);
		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			2,
			"docker volume rm vol-2 --force",
		);
		expect(mocks.deployPostgres).toHaveBeenCalledWith("db-1");
	});

	it("never constructs `docker volume rm '' --force` for an empty volumeName", async () => {
		setDatabase({
			mounts: [volumeMount(null), volumeMount(""), volumeMount("ok")],
		});

		await runRebuild("db-2", "postgres");

		const commands = mocks.execAsync.mock.calls.map((c) => c[0]);
		for (const cmd of commands) {
			expect(cmd).not.toMatch(/docker volume rm '' --force/);
		}
		expect(commands).toEqual(["docker volume rm ok --force"]);
		expect(mocks.deployPostgres).toHaveBeenCalledWith("db-2");
	});

	it("removes valid volume mounts on a remote server and skips bad ones via execAsyncRemote", async () => {
		setDatabase({
			appName: "remote-app",
			serverId: "server-1",
			mounts: [volumeMount(null), volumeMount("remote-vol")],
		});

		await runRebuild("db-3", "postgres");

		expect(mocks.removeService).toHaveBeenCalledWith("remote-app", "server-1");
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"docker volume rm remote-vol --force",
		);
		expect(mocks.deployPostgres).toHaveBeenCalledWith("db-3");
	});

	it("shell-quotes the volume name so an injected command stays a single argument", async () => {
		const name = "v;touch /tmp/pwned";
		expect(parse(quote([name]))).toEqual([name]);
		setDatabase({ mounts: [volumeMount(name)] });

		await runRebuild("db-4", "postgres");

		const cmd = mocks.execAsync.mock.calls[0]?.[0];
		expect(cmd).toBe(`docker volume rm ${quote([name])} --force`);
		expect(parse(cmd ?? "")).not.toContain("touch");
	});

	it("routes to the matching deploy function for each database type", async () => {
		const types: DatabaseType[] = [
			"postgres",
			"mysql",
			"mariadb",
			"mongo",
			"redis",
			"libsql",
		];

		for (const type of types) {
			vi.clearAllMocks();
			setDatabase({ mounts: [volumeMount("vol")] });

			await runRebuild(`id-${type}`, type);

			const expected = DEPLOY_BY_TYPE[type];
			for (const [t, fn] of Object.entries(DEPLOY_BY_TYPE)) {
				if (fn === expected) {
					expect(fn, `${t} should be called for ${type}`).toHaveBeenCalledWith(
						`id-${type}`,
					);
				} else {
					expect(
						fn,
						`${t} should not be called for ${type}`,
					).not.toHaveBeenCalled();
				}
			}
		}
	});
});

describe("mount volumeName schema validation", () => {
	const baseCreate = {
		serviceId: "svc-1",
		serviceType: "postgres" as const,
		mountPath: "/data",
	};

	describe("apiCreateMount", () => {
		it("accepts a volume mount with a valid volumeName", () => {
			expect(
				apiCreateMount.safeParse({
					...baseCreate,
					type: "volume",
					volumeName: "Vol_1.2-3",
				}).success,
			).toBe(true);
		});

		it.each([
			["missing", {}],
			["empty", { volumeName: "" }],
			["invalid", { volumeName: "bad name!" }],
			["starting with a separator", { volumeName: ".starts-with-dot" }],
		])("rejects a volume mount with %s volumeName", (_label, extra) => {
			const result = apiCreateMount.safeParse({
				...baseCreate,
				type: "volume",
				...extra,
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(
					result.error.issues.some((i) => i.path.includes("volumeName")),
				).toBe(true);
			}
		});

		it.each([
			["bind", { type: "bind", hostPath: "/host" }],
			["file", { type: "file", filePath: "config.env", content: "KEY=value" }],
		])("does not require volumeName for a %s mount", (_label, extra) => {
			expect(
				apiCreateMount.safeParse({ ...baseCreate, ...extra }).success,
			).toBe(true);
		});
	});

	describe("apiUpdateMount", () => {
		it("rejects flipping type to volume without a volumeName", () => {
			const result = apiUpdateMount.safeParse({
				mountId: "m-1",
				type: "volume",
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(
					result.error.issues.some((i) => i.path.includes("volumeName")),
				).toBe(true);
			}
		});

		it("accepts a valid volume update and rejects an invalid one", () => {
			expect(
				apiUpdateMount.safeParse({
					mountId: "m-1",
					type: "volume",
					volumeName: "new-vol",
				}).success,
			).toBe(true);
			expect(
				apiUpdateMount.safeParse({
					mountId: "m-1",
					type: "volume",
					volumeName: "bad name",
				}).success,
			).toBe(false);
		});

		it("does not require volumeName for a bind update or for an update that leaves type untouched", () => {
			expect(
				apiUpdateMount.safeParse({
					mountId: "m-1",
					type: "bind",
					hostPath: "/host",
				}).success,
			).toBe(true);
			expect(
				apiUpdateMount.safeParse({ mountId: "m-1", mountPath: "/new-data" })
					.success,
			).toBe(true);
		});
	});
});
