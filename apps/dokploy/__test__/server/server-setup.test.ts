import { execFileSync, execSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultCommand, reportDockerVersion } from "@dokploy/server";
import { describe, expect, it } from "vitest";

const resolveBin = (name: string) =>
	execSync(`command -v ${name}`, { encoding: "utf8" }).trim();

/**
 * Build a sandbox PATH so `command -v docker` only sees our fake docker
 * binary (or nothing), regardless of what the host has installed.
 */
const makeSandbox = (dockerShim?: string) => {
	const dir = mkdtempSync(path.join(tmpdir(), "dokploy-server-setup-"));
	for (const tool of ["awk", "tr"]) {
		const shim = path.join(dir, tool);
		writeFileSync(shim, `#!/bin/sh\nexec ${resolveBin(tool)} "$@"\n`);
		chmodSync(shim, 0o755);
	}
	if (dockerShim) {
		const shim = path.join(dir, "docker");
		writeFileSync(shim, dockerShim);
		chmodSync(shim, 0o755);
	}
	return dir;
};

const runReport = (sandboxPath: string) => {
	const script = [
		"DOCKER_VERSION=28.5.0",
		reportDockerVersion(),
		'echo "$DOCKER_VERSION_REPORT"',
	].join("\n");
	return execFileSync(resolveBin("bash"), ["-c", script], {
		encoding: "utf8",
		env: { ...process.env, PATH: sandboxPath },
	})
		.trim()
		.split("\n")
		.pop();
};

describe("reportDockerVersion", () => {
	it("reports the engine version when docker and its daemon are available", () => {
		const sandbox = makeSandbox(
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				'	echo "Docker version 25.0.0, build aaaaaaa"',
				"	exit 0",
				"fi",
				'if [ "$1" = "version" ]; then',
				'	echo "29.4.3"',
				"	exit 0",
				"fi",
				"exit 1",
			].join("\n"),
		);
		expect(runReport(sandbox)).toBe("29.4.3 (already installed)");
	});

	it("falls back to the client version when the daemon is unreachable", () => {
		const sandbox = makeSandbox(
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				'	echo "Docker version 29.4.3, build 055a478"',
				"	exit 0",
				"fi",
				'echo "Cannot connect to the Docker daemon" >&2',
				"exit 1",
			].join("\n"),
		);
		expect(runReport(sandbox)).toBe("29.4.3 (already installed)");
	});

	it("reports the pinned version to be installed when docker is missing", () => {
		expect(runReport(makeSandbox())).toBe("28.5.0 (will be installed)");
	});
});

describe("defaultCommand", () => {
	it.each([false, true])(
		"prints the detected Docker version in the setup banner (isBuildServer=%s)",
		(isBuildServer) => {
			const script = defaultCommand(isBuildServer);
			expect(script).toContain(reportDockerVersion());
			expect(script).toContain(
				'echo "| Docker            | $DOCKER_VERSION_REPORT"',
			);
			expect(script).not.toContain(
				'echo "| Docker            | $DOCKER_VERSION"',
			);
		},
	);
});
