import { execFileSync, execSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateSwarm } from "@dokploy/server";
import { afterEach, describe, expect, it } from "vitest";

const resolveBin = (name: string) =>
	execSync(`command -v ${name}`, { encoding: "utf8" }).trim();

/**
 * Build a sandbox PATH so `command -v docker` only sees our fake docker
 * binary, while `grep` passes through to the real system binary. Using the
 * real `grep` is intentional: the bug was an unanchored `grep -q 'active'`
 * substring match, and the fix anchors it with `grep -qx 'active'`, so we
 * must assert the real grep line-anchoring behavior, not a shim's.
 */
const makeSandbox = (localNodeState: string) => {
	const dir = mkdtempSync(path.join(tmpdir(), "dokploy-server-validate-"));
	for (const tool of ["grep"]) {
		const shim = path.join(dir, tool);
		writeFileSync(shim, `#!/bin/sh\nexec ${resolveBin(tool)} "$@"\n`);
		chmodSync(shim, 0o755);
	}
	const docker = path.join(dir, "docker");
	writeFileSync(
		docker,
		[
			"#!/bin/sh",
			'if [ "$1" = "info" ] && [ "$2" = "--format" ]; then',
			`	echo "${localNodeState}"`,
			"	exit 0",
			"fi",
			"exit 1",
		].join("\n"),
	);
	chmodSync(docker, 0o755);
	return dir;
};

const runValidateSwarm = (sandboxPath: string) =>
	execFileSync(resolveBin("bash"), ["-c", validateSwarm()], {
		encoding: "utf8",
		env: { ...process.env, PATH: sandboxPath },
	}).trim();

describe("validateSwarm", () => {
	const sandboxDirs: string[] = [];

	const makeSandboxTracked = (localNodeState: string) => {
		const dir = makeSandbox(localNodeState);
		sandboxDirs.push(dir);
		return dir;
	};

	afterEach(() => {
		while (sandboxDirs.length > 0) {
			const dir = sandboxDirs.pop()!;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("reports true when the node is an active swarm member", () => {
		expect(runValidateSwarm(makeSandboxTracked("active"))).toBe("true");
	});

	it("reports false when the node is not part of any swarm (LocalNodeState=inactive)", () => {
		// Regression: the buggy `grep -q 'active'` matched `inactive` as a
		// substring (in+active), falsely reporting isSwarmInstalled=true.
		expect(runValidateSwarm(makeSandboxTracked("inactive"))).toBe("false");
	});

	it.each(["pending", "error", "locked"])(
		"reports false for the non-active LocalNodeState=%s",
		(state) => {
			expect(runValidateSwarm(makeSandboxTracked(state))).toBe("false");
		},
	);
});
