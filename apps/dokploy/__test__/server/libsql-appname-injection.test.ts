import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { apiCreateLibsql } from "@dokploy/server/db/schema";
import { getContainerLogs } from "@dokploy/server/services/docker";
import {
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
} from "@dokploy/server/utils/docker/utils";
import { quote } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The libsql `appName` is later interpolated raw into shell commands in
// packages/server/src/utils/docker/utils.ts (stopService/startService/
// removeService and their *Remote variants) and packages/server/src/
// services/docker.ts (the two `--filter` find commands in getContainerLogs).
// We mock execAsync/execAsyncRemote to *capture* the exact command string the
// server would run, then replay it through /bin/sh with `docker` swapped for
// `:` (a shell no-op) so the test only exercises shell execution semantics —
// mirroring the convention in __test__/server/swarm-nodeid-injection.test.ts
// but against the REAL sink functions rather than a reimplementation.

const { execAsync, execAsyncRemote } = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsync,
		execAsyncRemote,
	};
});

let captured: { command: string }[] = [];

const resetSinks = () => {
	captured = [];
	execAsync.mockImplementation(async (command: string) => {
		captured.push({ command });
		return { stdout: "", stderr: "" };
	});
	execAsyncRemote.mockImplementation(
		async (_serverId: string, command: string) => {
			captured.push({ command });
			return { stdout: "", stderr: "" };
		},
	);
};

// `docker` -> `:` so the replay runs through the shell without touching docker.
const toNoOp = (command: string) => command.replace(/\bdocker\b/g, ":");

// Returns true if running `command` (no-op'd) creates no marker file.
const shellIsSafe = (command: string, mark: string) => {
	if (existsSync(mark)) rmSync(mark);
	try {
		execSync(toNoOp(command), { shell: "/bin/sh", stdio: "ignore" });
	} catch {
		// A non-zero exit is fine; we only care whether the marker was created.
	}
	const created = existsSync(mark);
	if (created) rmSync(mark);
	return !created;
};

const VALID_BASE = {
	name: "my-libsql",
	appName: "my-libsql",
	dockerImage: "ghcr.io/tursodatabase/libsql-server:v0.24.32",
	environmentId: "env-1",
	description: "",
	databaseUser: "root",
	databasePassword: "password123",
	sqldNode: "primary" as const,
	sqldPrimaryUrl: null,
	enableNamespaces: false,
	serverId: "",
};

// Shell-injection payloads that the pre-fix libsql schema persisted verbatim
// because cleanAppName only lowercases and swaps spaces for `-` (it leaves
// $, backticks, ;, |, &, >, " etc. untouched). %MARK% is replaced with a
// unique file path; if the shell evaluates the payload the marker appears.
const INJECTION_TEMPLATES = [
	"$(touch %MARK%)",
	"`touch %MARK%`",
	"$(>%MARK%)",
	"$(>%MARK%);echo",
	";touch %MARK%;",
	"|touch %MARK%|",
	"&& touch %MARK%",
	'$(id)";touch %MARK%;echo "',
];

const runSink = async (sink: string, appName: string) => {
	resetSinks();
	switch (sink) {
		case "stopService":
			await stopService(appName);
			break;
		case "stopServiceRemote":
			await stopServiceRemote("srv-1", appName);
			break;
		case "startService":
			await startService(appName);
			break;
		case "startServiceRemote":
			await startServiceRemote("srv-1", appName);
			break;
		case "removeService":
			await removeService(appName);
			break;
		case "getContainerLogs": {
			// The mock returns empty stdout, so both `--filter` finds are emitted
			// before getContainerLogs throws "No container or service found".
			try {
				await getContainerLogs(appName, 100, "all", undefined, undefined);
			} catch {
				/* expected */
			}
			break;
		}
	}
	const cmds = [...captured];
	captured = [];
	return cmds;
};

const SINKS = [
	"stopService",
	"stopServiceRemote",
	"startService",
	"startServiceRemote",
	"removeService",
	"getContainerLogs",
] as const;

describe("libsql.create appName schema validation (root-cause fix)", () => {
	it("rejects shell-injection payloads that cleanAppName would have let through", () => {
		const mark = `/tmp/dokploy_libsql_schema_${process.pid}`;
		for (const template of INJECTION_TEMPLATES) {
			const appName = template.replaceAll("%MARK%", mark);
			const result = apiCreateLibsql.safeParse({ ...VALID_BASE, appName });
			expect(result.success, `appName=${appName}`).toBe(false);
		}
		if (existsSync(mark)) rmSync(mark);
	});

	it("rejects appName longer than 63 characters", () => {
		const result = apiCreateLibsql.safeParse({
			...VALID_BASE,
			appName: "a".repeat(64),
		});
		expect(result.success).toBe(false);
	});

	it("rejects an empty appName", () => {
		const result = apiCreateLibsql.safeParse({ ...VALID_BASE, appName: "" });
		expect(result.success).toBe(false);
	});

	it("accepts legitimate appNames and preserves them unchanged", () => {
		for (const appName of [
			"my-db",
			"my.db_1",
			"My-DB.2",
			"libsql-prod-01",
			"a",
			"a.b.c-d_e",
		]) {
			const result = apiCreateLibsql.safeParse({ ...VALID_BASE, appName });
			expect(result.success, `appName=${appName}`).toBe(true);
			if (result.success) {
				expect(result.data.appName).toBe(appName);
			}
		}
	});

	it("still accepts the whole valid payload when appName is valid", () => {
		const result = apiCreateLibsql.safeParse({
			...VALID_BASE,
			appName: "my-libsql-prod",
		});
		expect(result.success).toBe(true);
	});
});

describe("libsql shell sinks neutralize stored appName command injection", () => {
	beforeEach(() => {
		resetSinks();
	});

	it("passes a legitimate appName through unchanged in every sink", async () => {
		const legit = "libsql-my-db-a1b2c3";
		for (const sink of SINKS) {
			const cmds = await runSink(sink, legit);
			expect(cmds.length, sink).toBeGreaterThan(0);
			for (const { command } of cmds) {
				expect(command, sink).toContain(legit);
			}
		}
		expect(quote([legit])).toBe(legit);
	});

	for (const sink of SINKS) {
		it(`${sink}: no injected command executes from a malicious appName`, async () => {
			for (const template of INJECTION_TEMPLATES) {
				const stamp = Math.random().toString(36).slice(2);
				const mark = `/tmp/dokploy_libsql_${sink}_${process.pid}_${stamp}`;
				const appName = template.replaceAll("%MARK%", mark);
				const cmds = await runSink(sink, appName);
				expect(cmds.length, `payload=${appName}`).toBeGreaterThan(0);
				for (const { command } of cmds) {
					expect(shellIsSafe(command, mark), `${sink} command=${command}`).toBe(
						true,
					);
				}
			}
		});
	}
});
