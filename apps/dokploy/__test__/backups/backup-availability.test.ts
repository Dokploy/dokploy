import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import { quote } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => exec);
vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getContainerSearchCommand: () => "docker ps --filter label=fixture -q",
}));

import {
	assertBackupAvailable,
	getBackupAvailability,
} from "@dokploy/server/utils/backups/availability";
import { getDatabaseReadinessCommand } from "@dokploy/server/utils/backups/compose-command";

const backup = {
	backupType: "compose",
	databaseType: "postgres",
	database: "app",
	serviceName: "db",
	compose: { appName: "fixture", serverId: null },
	metadata: {
		postgres: {
			databaseHost: "proxy",
			databasePort: 6543,
			databasePassword: "secret",
		},
	},
} as BackupSchedule;

describe("backup availability", () => {
	beforeEach(() => vi.resetAllMocks());
	it.each(["stopped", "unhealthy", "unavailable", "unexpected", ""])(
		"blocks %s states before a manual backup",
		async (stdout) => {
			exec.execAsync.mockResolvedValue({ stdout, stderr: "" });
			expect((await getBackupAvailability(backup)).available).toBe(false);
			await expect(assertBackupAvailable(backup)).rejects.toThrow();
		},
	);
	it("accepts a ready service even when its backup schedule is disabled", async () => {
		exec.execAsync.mockResolvedValue({ stdout: "ready", stderr: "" });
		expect(await getBackupAvailability({ ...backup, enabled: false })).toEqual({
			available: true,
			reason: null,
		});
		const script = exec.execAsync.mock.calls[0]?.[0];
		expect(script).toContain("docker inspect");
		expect(script).toContain(quote(["--host=proxy", "--port=6543"]));
		expect(script).not.toMatch(/rclone|docker run|docker service create|gzip/);
	});
	it("uses the existing remote executor", async () => {
		exec.execAsyncRemote.mockResolvedValue({ stdout: "ready", stderr: "" });
		expect(
			(
				await getBackupAvailability({
					...backup,
					compose: { ...backup.compose!, serverId: "remote" },
				})
			).available,
		).toBe(true);
		expect(exec.execAsyncRemote).toHaveBeenCalledWith(
			"remote",
			expect.any(String),
		);
		expect(exec.execAsync).not.toHaveBeenCalled();
	});
	it("never exposes executor output or credentials", async () => {
		exec.execAsync.mockRejectedValue(
			new Error("PGPASSWORD=secret postgresql://user:secret@host/app"),
		);
		const result = await getBackupAvailability(backup);
		expect(result.available).toBe(false);
		expect(JSON.stringify(result)).not.toMatch(/secret|PGPASSWORD|postgresql/);
	});
	it("does not inspect an unconfigured service", async () => {
		expect(
			(await getBackupAvailability({ ...backup, serviceName: null })).available,
		).toBe(false);
		expect(exec.execAsync).not.toHaveBeenCalled();
	});
	it.each(["postgres", "mysql", "mariadb", "mongo"] as const)(
		"uses native %s credentials instead of Compose metadata",
		async (databaseType) => {
			exec.execAsync.mockResolvedValue({ stdout: "ready", stderr: "" });
			await getBackupAvailability({
				...backup,
				backupType: "database",
				databaseType,
				[databaseType]: {
					appName: "native",
					databaseUser: "native-user",
					databasePassword: "native-password",
					databaseRootPassword: "native-root",
					serverId: null,
				},
			} as BackupSchedule);
			const script = exec.execAsync.mock.calls[0]?.[0];
			expect(script).not.toContain(quote(["--host=proxy"]));
			expect(script).toContain(
				databaseType === "mysql" ? "native-root" : "native-user",
			);
		},
	);
	it("checks the existing libsql backup source without exporting it", async () => {
		exec.execAsync.mockResolvedValue({ stdout: "ready", stderr: "" });
		await getBackupAvailability({
			...backup,
			backupType: "database",
			databaseType: "libsql",
			libsql: { appName: "libsql", serverId: null },
			database: "iku.db",
		} as BackupSchedule);
		expect(exec.execAsync.mock.calls[0]?.[0]).toContain(
			"test -r /var/lib/sqld/iku.db",
		);
	});
});

describe("readiness commands", () => {
	it.each([0, 23, "hung"])(
		"handles probe result %s without requiring timeout in legacy images",
		(result) => {
			const directory = mkdtempSync(path.join(tmpdir(), "backup-probe-"));
			try {
				for (const tool of ["bash", "sleep"])
					symlinkSync(`/bin/${tool}`, path.join(directory, tool));
				writeFileSync(
					path.join(directory, "docker"),
					'#!/bin/bash\nshift 3\nexec "$@"\n',
				);
				writeFileSync(
					path.join(directory, "pg_dump"),
					`#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.PID_FILE, String(process.pid));\n${result === "hung" ? "setInterval(() => {}, 1000);" : `process.exit(${result});`}`,
				);
				chmodSync(path.join(directory, "docker"), 0o755);
				chmodSync(path.join(directory, "pg_dump"), 0o755);
				const pidFile = path.join(directory, "pid");
				const execution = spawnSync(
					"/bin/bash",
					[
						"-c",
						getDatabaseReadinessCommand({
							database: "app",
							databaseType: "postgres",
						}),
					],
					{
						env: {
							NODE_ENV: "test",
							PATH: directory,
							CONTAINER_ID: "fixture",
							PID_FILE: pidFile,
						},
						timeout: 15_000,
					},
				);
				expect(execution.status).toBe(result === "hung" ? 124 : result);
				expect(() =>
					process.kill(Number(readFileSync(pidFile, "utf8")), 0),
				).toThrow();
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		20_000,
	);
	it.each([
		["postgres", "--schema-only"],
		["mysql", "--no-data"],
		["mariadb", "--no-data"],
		["mongo", "--query="],
	])("%s uses a fixed probe instead of a custom script", (engine, expected) => {
		const command = getDatabaseReadinessCommand({
			databaseType: engine,
			database: "app",
			metadata: {
				backupMode: "custom",
				custom: {
					script:
						engine === "mongo"
							? "mongodump --collection=orders --readPreference=secondaryPreferred"
							: "touch /injected",
				},
			},
		});
		expect(command).toContain(expected);
		if (engine === "mongo") {
			expect(command).toContain(quote(["--collection=orders"]));
			expect(command).toContain(quote(["--readPreference=secondaryPreferred"]));
		}
		expect(command).toContain("timeout -k 2 10");
		expect(command).not.toContain("touch");
		expect(command).not.toMatch(/gzip|rclone/);
	});
	it("preserves URI precedence", () => {
		const command = getDatabaseReadinessCommand({
			...backup,
			metadata: {
				postgres: {
					connectionUri: "postgresql://user:password@proxy:6543/app",
					databaseHost: "ignored",
					databasePort: 1234,
				},
			},
		});
		expect(command).toContain(
			quote(["--dbname=postgresql://user:password@proxy:6543/app"]),
		);
		expect(command).not.toContain("ignored");
		expect(command).not.toContain(quote(["--port=1234"]));
	});
	it("shell-quotes connection inputs without executing them", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "backup-readiness-"));
		try {
			const marker = path.join(directory, "injected");
			const capture = path.join(directory, "args.json");
			writeFileSync(
				path.join(directory, "docker"),
				`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));`,
			);
			chmodSync(path.join(directory, "docker"), 0o755);
			const password = `x' $(touch ${marker})`;
			const command = getDatabaseReadinessCommand({
				...backup,
				metadata: { postgres: { databasePassword: password } },
			});
			const result = spawnSync("bash", ["-c", command], {
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					CONTAINER_ID: "fixture",
				},
			});
			expect(result.status).toBe(0);
			expect(JSON.parse(readFileSync(capture, "utf8"))).toContain(
				`PGPASSWORD=${password}`,
			);
			expect(() => readFileSync(marker)).toThrow();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
