import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SANDBOX_EXEC_MARKER_ENV } from "@dokploy/server/utils/sandbox/exec";
import {
	buildSandboxRemoteExecScript,
	canUseSandboxRemoteExec,
} from "@dokploy/server/utils/sandbox/remote-exec";
import { describe, expect, it } from "vitest";

const runWithFakeDocker = (script: string, dockerBody: string) => {
	const dir = mkdtempSync(join(tmpdir(), "sandbox-remote-exec-"));
	const docker = join(dir, "docker");
	writeFileSync(docker, `#!/bin/sh\n${dockerBody}\n`);
	chmodSync(docker, 0o755);
	let status = 0;
	let stderr = "";
	try {
		execFileSync("sh", [], {
			input: script,
			env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, OUT: dir },
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (error) {
		const failure = error as { status: number; stderr: Buffer };
		status = failure.status;
		stderr = failure.stderr.toString();
	}
	const read = (name: string) => {
		try {
			return readFileSync(join(dir, name), "utf8");
		} catch {
			return "";
		}
	};
	return { status, stderr, read };
};

describe("canUseSandboxRemoteExec", () => {
	it("accepts single-line values and rejects line breaks", () => {
		expect(canUseSandboxRemoteExec()).toBe(true);
		expect(canUseSandboxRemoteExec({ A: "b c", D: "'\"$x" })).toBe(true);
		expect(canUseSandboxRemoteExec({ KEY: "line1\nline2" })).toBe(false);
		expect(canUseSandboxRemoteExec(["KEY=a\rb"])).toBe(false);
	});
});

describe("buildSandboxRemoteExecScript", () => {
	it("passes the command as one argument and the env through fd 3", () => {
		const cmd = 'echo "it\'s $HOME"; exit 7';
		const script = buildSandboxRemoteExecScript(
			"ctr1",
			{
				cmd,
				cwd: "/home/user/my dir",
				user: "1000:1000",
				env: { TOKEN: "s3cr3t $(id) 'q'", LD_PRELOAD: "/evil.so" },
			},
			"marker-1",
			"gone-token",
		);
		const result = runWithFakeDocker(
			script,
			[
				'if [ "$1" = exec ]; then',
				'  cat /dev/fd/3 > "$OUT/env"',
				'  printf "%s\\n" "$@" > "$OUT/args"',
				'  env > "$OUT/cli-env"',
				"  exit 7",
				"fi",
				"echo true",
			].join("\n"),
		);

		expect(result.status).toBe(7);
		expect(result.stderr).not.toContain("gone-token");
		expect(result.read("env")).toBe(
			`TOKEN=s3cr3t $(id) 'q'\nLD_PRELOAD=/evil.so\n${SANDBOX_EXEC_MARKER_ENV}=marker-1\n`,
		);
		expect(result.read("args").split("\n").slice(0, -1)).toEqual([
			"exec",
			"--env-file",
			"/dev/fd/3",
			"-w",
			"/home/user/my dir",
			"-u",
			"1000:1000",
			"ctr1",
			"sh",
			"-c",
			cmd,
		]);
		expect(result.read("cli-env")).not.toContain("LD_PRELOAD");
		expect(result.read("cli-env")).not.toContain("s3cr3t");
	});

	it("reports the container as gone only when it is not running", () => {
		const script = buildSandboxRemoteExecScript(
			"ctr1",
			{ cmd: "true" },
			"marker-1",
			"gone-token",
		);
		const gone = runWithFakeDocker(
			script,
			'if [ "$1" = exec ]; then exit 1; fi; exit 1',
		);
		expect(gone.status).toBe(1);
		expect(gone.stderr).toContain("gone-token");

		const alive = runWithFakeDocker(
			script,
			'if [ "$1" = exec ]; then exit 1; fi; echo true',
		);
		expect(alive.status).toBe(1);
		expect(alive.stderr).not.toContain("gone-token");
	});
});
