import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
	getKillRemoteBuildCommand,
	getRemoteBuildCancelTarget,
	getRemoteBuildPidFile,
	parseKillResult,
	shSingleQuote,
	wrapCancelableRemoteBuild,
} from "@dokploy/server/utils/builders/remote-build-cancel";

describe("pid file path", () => {
	it("is one file per deployment under the build server's logs directory", () => {
		expect(getRemoteBuildPidFile("dep_1-A")).toBe(
			"/etc/dokploy/logs/.build-pids/dep_1-A.pid",
		);
		expect(getRemoteBuildCancelTarget("dep1")).toEqual({
			pidFile: "/etc/dokploy/logs/.build-pids/dep1.pid",
			deploymentId: "dep1",
		});
	});

	it("keeps a hostile id inside the file name", () => {
		const path = getRemoteBuildPidFile("../../etc/x; rm -rf /");
		expect(path.startsWith("/etc/dokploy/logs/.build-pids/")).toBe(true);
		expect(path.slice("/etc/dokploy/logs/.build-pids/".length)).not.toMatch(
			/[/ ;]/,
		);
	});
});

describe("wrapCancelableRemoteBuild", () => {
	const target = { pidFile: "/logs/.build-pids/dep1.pid", deploymentId: "dep1" };
	const wrapped = wrapCancelableRemoteBuild("echo build; docker build .", target);

	it("starts the build in its own session and records the pid file", () => {
		expect(wrapped).toContain("setsid");
		expect(wrapped).toContain("'/logs/.build-pids/dep1.pid'");
		expect(wrapped).toContain("'dep1'");
		// <pgid> <start time> <deployment id>
		expect(wrapped).toContain('printf "%s %s %s\\n" "$$" "$s" "$2"');
		expect(wrapped).toContain("/proc/$$/stat");
	});

	it("keeps the command verbatim, single-quoted, and runs it in the login shell", () => {
		expect(wrapped).toContain("'echo build; docker build .'");
		expect(wrapped).toContain('exec "${SHELL:-sh}" -c "$3"');
	});

	it("removes the pid file afterwards and passes the exit status on", () => {
		expect(wrapped).toContain('rm -f "$__f"');
		expect(wrapped.trim().endsWith('exit "$__rc"')).toBe(true);
	});

	it("falls back to an uncancelable run when setsid is missing", () => {
		expect(wrapped).toContain("command -v setsid");
		expect(wrapped).toContain("cannot be cancelled from Dokploy");
	});

	it("is a different script per deployment", () => {
		const other = wrapCancelableRemoteBuild("echo build; docker build .", {
			pidFile: "/logs/.build-pids/dep2.pid",
			deploymentId: "dep2",
		});
		expect(other).not.toBe(wrapped);
		expect(other).toContain("dep2.pid");
		expect(other).not.toContain("dep1");
	});
});

describe("shell quoting of ids, paths and the command", () => {
	it("round-trips any string through a shell", () => {
		const nasty = [
			"it's",
			`a"b$(touch /tmp/x)\`id\``,
			"line1\nline2",
			"; rm -rf /",
			"$HOME ${IFS}",
			"back\\slash",
		];
		for (const value of nasty) {
			const result = spawnSync("sh", ["-c", `printf %s ${shSingleQuote(value)}`], {
				encoding: "utf8",
			});
			if (result.error) return; // no sh (plain Windows): nothing to check
			expect(result.stdout).toBe(value);
		}
	});

	it("never lets an id or path break out of the wrapper or the kill command", () => {
		const hostile = {
			pidFile: "/x/'; touch /tmp/pwned_pidfile; echo '.pid",
			deploymentId: "d'; touch /tmp/pwned_id; echo '",
		};
		for (const script of [
			wrapCancelableRemoteBuild("true", hostile),
			getKillRemoteBuildCommand(hostile),
		]) {
			// Every occurrence of the hostile text sits inside a single-quoted word.
			expect(script).not.toMatch(/(^|\n)\S*touch \/tmp\/pwned/);
			expect(script).toContain(shSingleQuote(hostile.pidFile));
			expect(script).toContain(shSingleQuote(hostile.deploymentId));
		}
	});
});

describe("getKillRemoteBuildCommand", () => {
	const target = { pidFile: "/logs/.build-pids/dep1.pid", deploymentId: "dep1" };
	const script = getKillRemoteBuildCommand(target);

	it("signals one process group, TERM first and KILL after a grace", () => {
		expect(script).toContain('kill -s TERM -- "-$pgid"');
		expect(script).toContain('kill -s KILL -- "-$pgid"');
		expect(script.indexOf("kill -s TERM")).toBeLessThan(
			script.indexOf("kill -s KILL"),
		);
	});

	it("only acts on a pid file that names this deployment and is the same process", () => {
		expect(script).toContain("f='/logs/.build-pids/dep1.pid'");
		expect(script).toContain("id='dep1'");
		expect(script).toContain('[ "$owner" = "$id" ]');
		expect(script).toContain('"$cur" = "$start"');
		expect(script).toContain('case "$pgid" in ""|*[!0-9]*|0|1)');
	});

	it("is scoped to the pid file: no pattern kills, no blanket docker kills, no argv", () => {
		for (const forbidden of [
			"pkill",
			"killall",
			"pgrep",
			"kill -9 -1",
			"docker kill",
			"docker stop",
			"docker rm",
			"ps ",
			"cmdline",
			"/proc/*/",
		]) {
			expect(script).not.toContain(forbidden);
		}
	});

	it("uses the grace it is given", () => {
		expect(getKillRemoteBuildCommand(target, 3)).toContain('-lt 3 ]');
		expect(getKillRemoteBuildCommand(target, 0)).toContain('-lt 1 ]');
	});
});

describe("parseKillResult", () => {
	it("reads the status word, ignoring noise before it", () => {
		expect(parseKillResult("KILLED\n")).toBe("KILLED");
		expect(parseKillResult("some banner\nNONE\n")).toBe("NONE");
		expect(parseKillResult("STALE")).toBe("STALE");
	});

	it("treats anything unexpected as a failure", () => {
		expect(parseKillResult("")).toBe("FAILED");
		expect(parseKillResult("Killed by signal")).toBe("FAILED");
	});
});

// A real shell and real stub processes: only the targeted group may die.
const hasSetsid =
	process.platform !== "win32" &&
	spawnSync("sh", ["-c", "command -v setsid && [ -d /proc/self ]"]).status === 0;

describe.skipIf(!hasSetsid)("stub processes on a real shell", () => {
	const dir = mkdtempSync(join(tmpdir(), "dokploy-cancel-"));
	const spawned: Array<ReturnType<typeof spawn>> = [];
	const groups: number[] = [];

	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	afterEach(() => {
		for (const group of groups.splice(0)) {
			try {
				process.kill(-group, "SIGKILL");
			} catch {}
		}
		for (const child of spawned.splice(0)) child.kill("SIGKILL");
	});

	const alive = (pgid: number) => {
		try {
			process.kill(-pgid, 0);
			return true;
		} catch {
			return false;
		}
	};

	const wait = async (condition: () => boolean, ms = 8000) => {
		const deadline = Date.now() + ms;
		while (!condition()) {
			if (Date.now() > deadline) throw new Error("timed out");
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	};

	const launch = async (deploymentId: string, command: string) => {
		const target = {
			pidFile: join(dir, `${deploymentId}.pid`),
			deploymentId,
		};
		const child = spawn("sh", ["-c", wrapCancelableRemoteBuild(command, target)], {
			env: { ...process.env, SHELL: "/bin/sh" },
			stdio: "ignore",
		});
		spawned.push(child);
		const exited = new Promise<number | null>((resolve) =>
			child.on("close", (code) => resolve(code)),
		);
		await wait(() => existsSync(target.pidFile));
		const [pgid] = readFileSync(target.pidFile, "utf8").trim().split(" ");
		groups.push(Number(pgid));
		return { target, pgid: Number(pgid), exited };
	};

	const kill = (target: { pidFile: string; deploymentId: string }) =>
		spawnSync("sh", ["-c", getKillRemoteBuildCommand(target, 3)], {
			encoding: "utf8",
		}).stdout.trim();

	it("kills the targeted deployment's whole group and only that one", async () => {
		// Each build is a shell with a child, like `docker compose` spawning buildx.
		const a = await launch("depA", "sleep 300 & sleep 301 & wait");
		const b = await launch("depB", "sleep 302 & wait");
		// An unrelated process that is not wrapped (a CI job on the same host).
		const unrelated = spawn("sleep", ["303"], { stdio: "ignore" });
		spawned.push(unrelated);

		expect(a.pgid).not.toBe(b.pgid);
		expect(alive(a.pgid) && alive(b.pgid)).toBe(true);

		expect(kill(a.target)).toBe("KILLED");

		expect(alive(a.pgid)).toBe(false);
		expect(alive(b.pgid)).toBe(true);
		expect(unrelated.exitCode).toBeNull();
		expect(() => process.kill(unrelated.pid as number, 0)).not.toThrow();

		// The wrapper reports the kill as a failed build and cleans its file up.
		expect(await a.exited).not.toBe(0);
		expect(existsSync(a.target.pidFile)).toBe(false);
		expect(existsSync(b.target.pidFile)).toBe(true);

		expect(kill(b.target)).toBe("KILLED");
		expect(alive(b.pgid)).toBe(false);
	}, 30000);

	it("passes a normal exit status through and removes the pid file", async () => {
		const ok = await launch("depOk", "sleep 0.3; exit 0");
		expect(await ok.exited).toBe(0);
		expect(existsSync(ok.target.pidFile)).toBe(false);
		const failed = await launch("depFail", "sleep 0.3; exit 7");
		expect(await failed.exited).toBe(7);
		expect(existsSync(failed.target.pidFile)).toBe(false);
	}, 30000);

	it("reports NONE when nothing is running for the deployment", () => {
		expect(
			kill({ pidFile: join(dir, "nothing.pid"), deploymentId: "nothing" }),
		).toBe("NONE");
	});

	it("refuses a pid file that belongs to another deployment", async () => {
		const a = await launch("depC", "sleep 304 & wait");
		// Cancel for a different deployment id pointed at depC's file.
		expect(kill({ pidFile: a.target.pidFile, deploymentId: "other" })).toBe(
			"STALE",
		);
		expect(alive(a.pgid)).toBe(true);
		expect(kill(a.target)).toBe("KILLED");
	}, 30000);

	it("does not signal a process that merely reuses the recorded pid", async () => {
		const bystander = spawn("sleep", ["305"], { stdio: "ignore" });
		spawned.push(bystander);
		const pidFile = join(dir, "reused.pid");
		// A pid file whose start time cannot match the live process.
		spawnSync("sh", [
			"-c",
			`printf '%s %s %s\\n' ${bystander.pid} 1 reused > ${shSingleQuote(pidFile)}`,
		]);
		expect(kill({ pidFile, deploymentId: "reused" })).toBe("GONE");
		expect(() => process.kill(bystander.pid as number, 0)).not.toThrow();
		expect(existsSync(pidFile)).toBe(false);
	});

	it("does not run a hostile deployment id", async () => {
		const mark = join(dir, "pwned");
		const id = `x'; touch ${mark}; echo '`;
		const target = { pidFile: join(dir, "hostile.pid"), deploymentId: id };
		spawnSync("sh", ["-c", wrapCancelableRemoteBuild("true", target)], {
			env: { ...process.env, SHELL: "/bin/sh" },
		});
		spawnSync("sh", ["-c", getKillRemoteBuildCommand(target, 1)]);
		expect(existsSync(mark)).toBe(false);
	});
});
