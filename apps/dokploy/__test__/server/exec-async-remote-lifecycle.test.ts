import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { findServerById } from "@dokploy/server/services/server";
import {
	ExecError,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { type Connection, Server, utils } from "ssh2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/server", () => ({ findServerById: vi.fn() }));

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

describe.skipIf(process.platform === "win32")(
	"real loopback SSH process lifecycle",
	() => {
		const key = utils.generateKeyPairSync("ed25519");
		let server: Server;
		const connections: Connection[] = [];
		const processes: ChildProcess[] = [];
		const observedPids = new Set<number>();

		const observeGroup = (group: number) => {
			for (const line of execFileSync("ps", ["-axo", "pid=,pgid="], {
				encoding: "utf8",
			}).split("\n")) {
				const [pid, pgid] = line.trim().split(/\s+/).map(Number);
				if (pid && pgid === group) observedPids.add(pid);
			}
		};

		beforeEach(async () => {
			observedPids.clear();
			server = new Server({ hostKeys: [key.private] }, (connection) => {
				connections.push(connection);
				connection.on("error", () => {});
				connection.on("authentication", (context) => context.accept());
				connection.on("ready", () =>
					connection.on("session", (accept) => {
						const session = accept();
						// Ignore SSH signals deliberately: the remote deadline must survive transport loss.
						session.on("signal", () => {});
						session.on("exec", (acceptExec, _reject, info) => {
							const channel = acceptExec();
							const child = spawn("/bin/sh", ["-c", info.command], {
								detached: true,
								stdio: ["ignore", "pipe", "pipe"],
							});
							processes.push(child);
							if (child.pid) observedPids.add(child.pid);
							child.stdout?.on("data", (chunk: Buffer) => {
								if (child.pid) observeGroup(child.pid);
								if (!channel.destroyed) channel.write(chunk);
							});
							child.stderr?.on("data", (chunk: Buffer) => {
								if (!channel.destroyed) channel.stderr.write(chunk);
							});
							child.on("close", (code, signal) => {
								if (channel.destroyed) return;
								if (signal) channel.exit(signal);
								else channel.exit(code ?? 1);
								channel.end();
							});
						});
					}),
				);
			});
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", resolve);
			});
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Missing fixture port");
			vi.mocked(findServerById).mockResolvedValue({
				sshKeyId: "fixture",
				ipAddress: "127.0.0.1",
				port: address.port,
				username: "fixture",
				sshKey: { privateKey: key.private },
			} as never);
		});

		afterEach(async () => {
			for (const child of processes.splice(0)) {
				if (!child.pid) continue;
				try {
					process.kill(-child.pid, "SIGKILL");
				} catch {
					/* already gone */
				}
			}
			for (const connection of connections.splice(0)) connection.end();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		});

		it("kills the remote shell, child, grandchild and watchdog after timeout even when signals are ignored", async () => {
			const command =
				"echo shell=$$; sh -c 'echo child=$$; sleep 30 & echo grandchild=$!; echo partial >&2; wait' & wait";
			const started = Date.now();
			await expect(
				execAsyncRemote("fixture", command, undefined, { timeout: 2000 }),
			).rejects.toSatisfy(
				(error: unknown) =>
					error instanceof ExecError &&
					/timed out/.test(error.message) &&
					(error.stdout?.includes("grandchild=") ?? false) &&
					(error.stderr?.includes("partial") ?? false),
			);
			expect(Date.now() - started).toBeLessThan(3500);
			expect(observedPids.size).toBeGreaterThanOrEqual(3);
			await vi.waitFor(
				() => {
					expect([...observedPids].filter(alive)).toEqual([]);
				},
				{ timeout: 2000, interval: 30 },
			);
		});

		it("retains remote cleanup after the SSH transport disconnects", async () => {
			let disconnected = false;
			const pending = execAsyncRemote(
				"fixture",
				"echo shell=$$; sleep 30 & echo grandchild=$!; wait",
				() => {
					if (disconnected) return;
					disconnected = true;
					connections[0]?.end();
				},
				{ timeout: 2000 },
			);
			await expect(pending).rejects.toBeInstanceOf(ExecError);
			expect(observedPids.size).toBeGreaterThanOrEqual(3);
			await vi.waitFor(
				() => expect([...observedPids].filter(alive)).toEqual([]),
				{ timeout: 2000, interval: 30 },
			);
		});

		it.each(["1", "2"])(
			"retains the deadline while an orphan grandchild holds output fd %s",
			async (fd) => {
				await expect(
					execAsyncRemote(
						"fixture",
						`sleep 30 >&${fd} & echo grandchild=$!`,
						undefined,
						{ timeout: 2000 },
					),
				).rejects.toSatisfy(
					(error: unknown) =>
						error instanceof ExecError && /timed out/.test(error.message),
				);
				await vi.waitFor(
					() => expect([...observedPids].filter(alive)).toEqual([]),
					{ timeout: 2000, interval: 30 },
				);
			},
		);

		it.each(["exit 0", "exec sh -c 'exit 0'"])(
			"does not leak the private exit status for %s",
			async (command) => {
				await expect(
					execAsyncRemote("fixture", command, undefined, { timeout: 2000 }),
				).resolves.toEqual({ stdout: "", stderr: "" });
			},
		);

		it("preserves large interleaved stdout and stderr independently", async () => {
			const command =
				"i=0; while [ $i -lt 2048 ]; do printf 'stdout\\n'; printf 'stderr\\n' >&2; i=$((i+1)); done";
			await expect(
				execAsyncRemote("fixture", command, undefined, { timeout: 5000 }),
			).resolves.toEqual({
				stdout: "stdout\n".repeat(2048),
				stderr: "stderr\n".repeat(2048),
			});
		});

		it.each([0, 7])(
			"clears every watchdog process on normal exit %i",
			async (code) => {
				const pending = execAsyncRemote(
					"fixture",
					`echo shell=$$; sleep 0.1; exit ${code}`,
					undefined,
					{ timeout: 30_000 },
				);
				if (code === 0)
					await expect(pending).resolves.toMatchObject({ stderr: "" });
				else
					await expect(pending).rejects.toMatchObject({
						exitCode: code,
						stderr: "",
					});
				await vi.waitFor(
					() => expect([...observedPids].filter(alive)).toEqual([]),
					{ timeout: 1000 },
				);
			},
		);
	},
);
