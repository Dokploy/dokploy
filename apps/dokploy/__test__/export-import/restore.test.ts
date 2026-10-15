import type {
	Snapshot,
	TransferDb,
	TransferResult,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it, vi } from "vitest";

const { failRestoreBox } = vi.hoisted(() => ({
	failRestoreBox: { value: false },
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsync: vi.fn(async (command: string) => {
			if (command.includes("pg_restore") && failRestoreBox.value) {
				throw new Error("restore failed");
			}
			return { stdout: "", stderr: "" };
		}),
		execAsyncRemote: vi.fn(async () => ({ stdout: "", stderr: "" })),
	};
});

vi.mock(
	"@dokploy/server/services/project-export-import/remote-fs",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/services/project-export-import/remote-fs")
			>();
		return {
			...actual,
			copyFile: vi.fn(async () => {}),
			remove: vi.fn(async () => {}),
		};
	},
);

const {
	restoreDumps,
	buildRestoreCommand,
	buildWaitReadyScript,
	buildReadyProbe,
	waitUntilReady,
} = await import("@dokploy/server/services/project-export-import");
const { remove, copyFile } = await import(
	"@dokploy/server/services/project-export-import/remote-fs"
);

describe("buildRestoreCommand", () => {
	it("pipes decompressed bytes into the restore command for postgres", () => {
		const command = buildRestoreCommand(
			"postgres",
			{
				appName: "my-db-abc123",
				databaseName: "mydb",
				databaseUser: "dokploy",
			},
			"/tmp/dokploy-import-restore-pg-1.sql.gz",
		);
		expect(command).toContain(
			"gunzip -c '/tmp/dokploy-import-restore-pg-1.sql.gz'",
		);
		expect(command).toContain("pg_restore");
		expect(command).toContain("my-db-abc123");
	});

	it("uses the mysql root password, not databasePassword, for the restore command", () => {
		const command = buildRestoreCommand(
			"mysql",
			{
				appName: "my-mysql-abc123",
				databaseName: "mydb",
				databasePassword: "not-the-root-password",
				databaseRootPassword: "the-real-root-password",
			},
			"/tmp/dokploy-import-restore-mysql-1.sql.gz",
		);
		expect(command).toContain("the-real-root-password");
		expect(command).not.toContain("not-the-root-password");
	});

	it("strips USE/CREATE DATABASE statements for mariadb (multi-db dump safety)", () => {
		const command = buildRestoreCommand(
			"mariadb",
			{
				appName: "my-mariadb-abc123",
				databaseName: "mydb",
				databaseUser: "dokploy",
				databasePassword: "pass",
			},
			"/tmp/dokploy-import-restore-mariadb-1.sql.gz",
		);
		expect(command).toContain("grep -viE");
	});

	it("restores the whole mongo archive through stdin, skipping admin/config, with --drop", () => {
		const command = buildRestoreCommand(
			"mongo",
			{
				appName: "my-mongo-abc123",
				databaseUser: "dokploy",
				databasePassword: "pass",
			},
			"/tmp/dokploy-import-restore-mongo-1.archive.gz",
		);
		expect(command).toContain(
			'mongorestore -u "$DB_USER" -p "$DB_PASS" --authenticationDatabase admin --nsExclude "admin.*" --nsExclude "config.*" --archive --gzip --drop',
		);
		expect(command).toContain(
			"< '/tmp/dokploy-import-restore-mongo-1.archive.gz'",
		);
		expect(command).not.toContain("--db");
	});
});

describe("buildRestoreCommand for libsql", () => {
	it("replaces sqld's data directory from the tarball and restarts the service", () => {
		const command = buildRestoreCommand(
			"libsql",
			{ appName: "my-libsql-abc123" },
			"/tmp/dokploy-import-restore-l.tar.gz",
		);
		expect(command).toContain(
			"rm -rf /var/lib/sqld/iku.db && tar xzf - -C /var/lib/sqld",
		);
		expect(command).toContain("< '/tmp/dokploy-import-restore-l.tar.gz'");
		expect(command).toContain(
			"docker service update --force 'my-libsql-abc123'",
		);
	});
});

describe("buildReadyProbe", () => {
	it("runs a credentialed query rather than a liveness ping", () => {
		expect(
			buildReadyProbe("postgres", { databaseUser: "u", databaseName: "d" }),
		).toBe('psql -U u -d d -tAc "SELECT 1"');
		expect(
			buildReadyProbe("mysql", { databaseRootPassword: "r00t" }),
		).toContain("mysql -uroot --password=r00t");
		expect(
			buildReadyProbe("mariadb", { databaseUser: "u", databasePassword: "p" }),
		).toContain("mariadb -uu --password=p");
		expect(
			buildReadyProbe("mongo", {
				databaseUser: "u",
				databasePassword: "p",
				databaseName: "d",
			}),
		).toContain(
			'then mongosh --quiet -u u -p p --authenticationDatabase admin --eval "db.adminCommand({ping: 1}).ok"; else mongo ',
		);
	});
});

describe("waitUntilReady", () => {
	it("needs consecutive successes so a first-init throwaway server doesn't count", async () => {
		const { execAsync } = await import(
			"@dokploy/server/utils/process/execAsync"
		);
		const previous = (execAsync as any).getMockImplementation();
		const outcomes = [true, true, false, true, true, true];
		let calls = 0;
		(execAsync as any).mockImplementation(async (command: string) => {
			if (!command.includes("SELECT 1")) return { stdout: "", stderr: "" };
			const ok = outcomes[calls++] ?? true;
			if (!ok) throw new Error("the database system is shutting down");
			return { stdout: "1", stderr: "" };
		});
		try {
			await waitUntilReady(null, "db-app", 'psql -tAc "SELECT 1"', {
				intervalMs: 0,
				stableSuccesses: 3,
			});
		} finally {
			(execAsync as any).mockImplementation(previous);
		}
		expect(calls).toBe(6);
	});
});

describe("buildWaitReadyScript", () => {
	it("guards against an empty CONTAINER_ID before exec'ing the probe", () => {
		const script = buildWaitReadyScript("my-db-abc123", "pg_isready");
		expect(script).toContain('if [ -z "$CONTAINER_ID" ]; then exit 1; fi');
		expect(script).toContain("docker exec");
		expect(script).toContain("pg_isready");
	});
});

const snapshot: Snapshot = {
	manifest: {
		format: "dokploy-project-export",
		formatVersion: 1,
		exportedAt: "2024-01-01T00:00:00.000Z",
		exportedBy: { userId: "user-1", email: "a@b.com" },
		sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-1" },
		scope: {
			includeEnvSecrets: true,
			shared: {},
			files: {
				applicationSources: false,
				composeFiles: false,
				traefikRaw: false,
				customCertificates: false,
			},
			dumps: { mode: "embed" },
			includeBackupSchedules: true,
		},
		crypto: {
			salt: "c2FsdA==",
			kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
			keyCheck: "{}",
		},
		counts: {},
	},
	resources: {
		project: {},
		environments: [],
		services: [],
		shared: {},
	},
	requirements: [],
	warnings: [],
	dumps: [
		{
			serviceId: "pg-1",
			serviceType: "postgres",
			mode: "embed",
			ext: "sql.gz",
			path: "dumps/pg-1.sql.gz",
			bytes: 100,
		},
	],
};

const dbFor = (): TransferDb =>
	({
		query: {
			postgres: {
				findFirst: async () => ({
					postgresId: "pg-new-1",
					appName: "my-db-new-1",
					databaseName: "mydb",
					databaseUser: "dokploy",
					databasePassword: "p",
					serverId: null,
				}),
			},
			destinations: { findFirst: async () => undefined },
		},
	}) as any as TransferDb;

const resultFor = (): TransferResult =>
	({
		idMap: { postgres: { "pg-1": "pg-new-1" } },
	}) as any as TransferResult;

describe("restoreDumps uses the workspace dump directly when it already sits on the target server", () => {
	it("neither copies nor removes anything and restores from the workspace path", async () => {
		failRestoreBox.value = false;
		vi.mocked(remove).mockClear();
		vi.mocked(copyFile).mockClear();

		const errors = await restoreDumps(
			dbFor(),
			snapshot,
			resultFor(),
			{ serverId: null, path: "/tmp/work" },
			{
				readiness: { intervalMs: 0, stableSuccesses: 1 },
				deploy: { postgres: async () => {} },
			},
		);

		expect(errors).toHaveLength(0);
		expect(copyFile).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
	});
});

describe("restoreDumps cleans up the copied remote dump file (T-5.8)", () => {
	it("removes the remote dump path after a successful restore", async () => {
		failRestoreBox.value = false;
		vi.mocked(remove).mockClear();

		const errors = await restoreDumps(
			dbFor(),
			snapshot,
			resultFor(),
			{ serverId: "workspace-server", path: "/tmp/work" },
			{
				readiness: { intervalMs: 0, stableSuccesses: 1 },
				deploy: { postgres: async () => {} },
			},
		);

		expect(errors).toHaveLength(0);
		expect(remove).toHaveBeenCalledWith({
			serverId: null,
			path: "/tmp/dokploy-import-restore-pg-new-1.sql.gz",
		});
	});

	it("still removes the remote dump path when the restore command itself fails", async () => {
		failRestoreBox.value = true;
		vi.mocked(remove).mockClear();

		const errors = await restoreDumps(
			dbFor(),
			snapshot,
			resultFor(),
			{ serverId: "workspace-server", path: "/tmp/work" },
			{
				readiness: { intervalMs: 0, stableSuccesses: 1 },
				deploy: { postgres: async () => {} },
			},
		);

		expect(errors).toHaveLength(1);
		expect(remove).toHaveBeenCalledWith({
			serverId: null,
			path: "/tmp/dokploy-import-restore-pg-new-1.sql.gz",
		});

		failRestoreBox.value = false;
	});
});

describe("restoreDumps rejects an unsafe dump.path (T-9.1)", () => {
	it("never copies the dump and reports a restore error for a path-traversal dump.path", async () => {
		vi.mocked(copyFile).mockClear();
		const maliciousSnapshot: Snapshot = {
			...snapshot,
			dumps: [
				{
					serviceId: "pg-1",
					serviceType: "postgres",
					mode: "embed",
					ext: "sql.gz",
					path: "../../../../etc/passwd",
					bytes: 100,
				},
			],
		};

		const errors = await restoreDumps(
			dbFor(),
			maliciousSnapshot,
			resultFor(),
			{ serverId: "workspace-server", path: "/tmp/work" },
			{
				readiness: { intervalMs: 0, stableSuccesses: 1 },
				deploy: { postgres: async () => {} },
			},
		);

		expect(copyFile).not.toHaveBeenCalled();
		expect(errors).toHaveLength(1);
		expect(errors[0]?.error).toContain("Unsafe path in bundle");
	});
});
