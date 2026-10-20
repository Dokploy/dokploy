import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerSafeExec } from "@dokploy/server/utils/docker/utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// The generated script runs against stand-ins on a PATH that holds nothing else,
// so a host's real docker or ctr can never answer for them. Each stand-in records
// its arguments; a "busy once" one prints its busy output on its first call only,
// so a script that notices it waits exactly once and then runs the command.
const stub = (dir: string, name: string, body: string) => {
	writeFileSync(
		join(dir, name),
		`#!/bin/sh\nprintf '%s\\n' "$*" >> "${dir}/${name}.args"\n${body}\n`,
	);
	chmodSync(join(dir, name), 0o755);
};

const busyOnce = (dir: string, name: string, firstOutput: string) =>
	stub(
		dir,
		name,
		`[ "$(wc -l < "${dir}/${name}.args")" -eq 1 ] && printf '%s\\n' '${firstOutput}'\nexit 0`,
	);

const argsOf = (dir: string, name: string) =>
	readFileSync(join(dir, `${name}.args`), "utf8").split("\n")[0];

const hostTool = (name: string) =>
	execFileSync("sh", ["-c", `command -v ${name}`])
		.toString()
		.trim();

let bin: string;
let socket: Server | undefined;

beforeEach(() => {
	bin = mkdtempSync(join(tmpdir(), "docker-safe-exec-"));
	for (const tool of ["awk", "grep", "cat", "wc"]) {
		symlinkSync(hostTool(tool), join(bin, tool));
	}
	stub(bin, "sleep", "exit 0");
	stub(bin, "ps", "exit 0");
	stub(bin, "docker", "exit 0");
});

afterEach(async () => {
	await new Promise<void>((resolve) =>
		socket ? socket.close(() => resolve()) : resolve(),
	);
	socket = undefined;
	rmSync(bin, { recursive: true, force: true });
});

const containerdSocket = () => join(bin, "containerd.sock");

const listenOnContainerdSocket = () =>
	new Promise<void>((resolve) => {
		socket = createServer().listen(containerdSocket(), resolve);
	});

const run = () =>
	execFileSync(hostTool("sh"), ["-c", dockerSafeExec("echo RAN")], {
		env: {
			PATH: bin,
			CONTAINERD_ADDRESS: containerdSocket(),
			NODE_ENV: "test",
		},
	}).toString();

const busyCycles = (out: string) => out.match(/Docker is busy/g)?.length ?? 0;

describe("dockerSafeExec", () => {
	test("runs at once when nothing is pulling", () => {
		const out = run();
		expect(busyCycles(out)).toBe(0);
		expect(out).toContain("RAN");
	});

	test("waits while a docker CLI process is running", () => {
		busyOnce(bin, "ps", "docker pull nginx:latest");
		const out = run();
		expect(busyCycles(out)).toBe(1);
		expect(out).toContain("RAN");
	});

	test("waits while a Swarm task on this node is pulling its image", () => {
		busyOnce(bin, "docker", "Preparing 3 seconds ago");
		const out = run();
		expect(busyCycles(out)).toBe(1);
		expect(out).toContain("RAN");
	});

	test("asks Swarm about tasks that are running or still to start", () => {
		run();
		expect(argsOf(bin, "docker")).toBe(
			"node ps self --filter desired-state=running --filter desired-state=ready --format {{.CurrentState}}",
		);
	});

	test("does not wait for Swarm tasks that are already running", () => {
		stub(bin, "docker", "echo 'Running 2 hours ago'");
		const out = run();
		expect(busyCycles(out)).toBe(0);
		expect(out).toContain("RAN");
	});

	test("treats a node that is not a swarm manager as idle", () => {
		stub(
			bin,
			"docker",
			"echo 'Error response from daemon: This node is not a swarm manager.' >&2; exit 1",
		);
		const out = run();
		expect(busyCycles(out)).toBe(0);
		expect(out).toContain("RAN");
	});

	test("waits while containerd holds a pull lease", async () => {
		await listenOnContainerdSocket();
		busyOnce(bin, "ctr", "123456789-AbCd");
		const out = run();
		expect(busyCycles(out)).toBe(1);
		expect(out).toContain("RAN");
	});

	test("asks containerd only for the leases dockerd uses for pulls", async () => {
		await listenOnContainerdSocket();
		stub(bin, "ctr", "exit 0");
		run();
		expect(argsOf(bin, "ctr")).toBe(
			'-n moby leases ls -q labels."moby/prune.images"',
		);
	});

	test("does not call ctr when containerd's socket is absent", () => {
		stub(bin, "ctr", "exit 0");
		const out = run();
		expect(existsSync(join(bin, "ctr.args"))).toBe(false);
		expect(busyCycles(out)).toBe(0);
		expect(out).toContain("RAN");
	});

	test("treats a host without ctr as idle", async () => {
		await listenOnContainerdSocket();
		const out = run();
		expect(busyCycles(out)).toBe(0);
		expect(out).toContain("RAN");
	});

	test("treats a ctr that cannot read containerd's socket as idle", async () => {
		await listenOnContainerdSocket();
		stub(
			bin,
			"ctr",
			"echo 'ctr: failed to dial: permission denied' >&2; exit 1",
		);
		const out = run();
		expect(busyCycles(out)).toBe(0);
		expect(out).toContain("RAN");
	});
});
