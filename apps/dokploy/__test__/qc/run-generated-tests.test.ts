import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { QcManifest } from "@dokploy/server/services/qc-service-client";
import {
	buildTestRunScript,
	getCodePath,
	getContainerName,
	getRunnerImage,
	getWorkDir,
	runGeneratedTests,
} from "@dokploy/server/utils/builders/run-generated-tests";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const manifest = (overrides: Partial<QcManifest> = {}): QcManifest => ({
	language: "node",
	framework: "vitest",
	targetDir: "web",
	cwd: "web",
	install: "npm ci",
	installNeedsNetwork: true,
	command:
		"npx vitest run qc_generated --reporter=json --outputFile=/out/results.json",
	resultsFormat: "vitest-json",
	timeoutSec: 600,
	needsNetwork: false,
	files: ["web/qc_generated/a.test.ts"],
	scenarios: ["S-1"],
	...overrides,
});

describe("getRunnerImage", () => {
	it("picks an image from the language, unless the user chose one", () => {
		expect(getRunnerImage({ language: "node" })).toBe("node:22");
		expect(getRunnerImage({ language: "python" })).toBe("python:3.12");
		expect(getRunnerImage({ language: "go" })).toBe("golang:1.23");
		expect(getRunnerImage({ language: "go" }, " golang:1.22-alpine ")).toBe(
			"golang:1.22-alpine",
		);
		expect(getRunnerImage({ language: "node" }, "  ")).toBe("node:22");
	});

	it("refuses a language it has no image for", () => {
		expect(() => getRunnerImage({ language: "cobol" })).toThrow(/cobol/);
	});
});

describe("work directory and container names", () => {
	it("never lets a deployment id escape its directory or break a name", () => {
		expect(getWorkDir("abc_DEF-1")).toBe("/tmp/qc-exec-abc_DEF-1");
		expect(getWorkDir("../../etc")).toBe("/tmp/qc-exec-______etc");
		expect(getContainerName("-x y")).toBe("qc-exec--x_y");
	});
});

describe("buildTestRunScript", () => {
	const build = (m = manifest(), decodeBundle = false) =>
		buildTestRunScript({
			workDir: getWorkDir("dep1"),
			codePath: "/etc/dokploy/applications/app/code",
			image: "node:22",
			manifest: m,
			deploymentId: "dep1",
			decodeBundle,
		});

	it("isolates the container", () => {
		const script = build();
		expect(script).toContain("--cap-drop ALL");
		expect(script).toContain("--security-opt no-new-privileges");
		expect(script).toContain("--memory 2g");
		expect(script).toContain("--pids-limit 512");
		expect(script).toContain('--user "$(id -u):$(id -g)"');
		expect(script).toContain("timeout -k 10 600 docker run --rm --name");
		expect(script).not.toContain("docker.sock");
		expect(script).not.toContain("--privileged");
		expect(script).not.toContain("--env-file");
	});

	it("gives the container network only when the install needs it", () => {
		expect(build()).toContain("--network bridge");
		expect(
			build(manifest({ install: "true", installNeedsNetwork: false })),
		).toContain("--network none");
	});

	it("mounts only a copy of the source and the results folder", () => {
		const script = build();
		expect(script).toContain(
			'cp -a /etc/dokploy/applications/app/code "$W/app"',
		);
		expect(script).toContain('-v "$W/app:/app" -v "$W/out:/out"');
		expect(script).toContain("-w /app/web");
	});

	it("runs from the project root when the manifest's cwd is '.'", () => {
		expect(build(manifest({ cwd: "." }))).toMatch(/-w \/app\/ /);
	});

	it("runs the install and the command in one shell, quoted", () => {
		const script = build(
			manifest({
				install: "true",
				command: "go test ./... -json > /out/r.json",
			}),
		);
		expect(script).toContain(
			"sh -c 'true && go test ./... -json > /out/r.json'",
		);
	});

	it("checks the bundle's paths and always exits 0 with the exit code on disk", () => {
		const script = build();
		expect(script).toContain('tar -tzf "$W/tests.tar.gz" | grep -Eq');
		expect(script).toContain("--no-same-owner");
		expect(script).toContain('echo $? > "$W/exit"');
		expect(script.trim().endsWith("exit 0")).toBe(true);
	});

	it("decodes the bundle only when it was uploaded as base64", () => {
		expect(build(manifest(), true)).toContain("base64 -d");
		expect(build(manifest(), false)).not.toContain("base64 -d");
	});

	it("refuses a work directory outside /tmp/qc-exec-", () => {
		expect(() =>
			buildTestRunScript({
				workDir: "/",
				codePath: "/x",
				image: "node:22",
				manifest: manifest(),
				deploymentId: "d",
				decodeBundle: false,
			}),
		).toThrow(/work directory/);
	});
});

// Runs the real script with bash against a stand-in `docker`, so the shell
// logic (set -e, the tar guard, the exit code capture, cleanup) is exercised.
describe.skipIf(process.platform === "win32")("runGeneratedTests", () => {
	const appName = `qc-test-app-${process.pid}`;
	const dep = `dep${process.pid}`;
	let tmp: string;
	let argvLog: string;
	let originalPath: string | undefined;

	const makeBundle = (files: Record<string, string>) => {
		const root = fs.mkdtempSync(path.join(tmp, "bundle-"));
		for (const [rel, content] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			fs.writeFileSync(path.join(root, rel), content);
		}
		const out = path.join(tmp, `bundle-${Math.random()}.tgz`);
		execFileSync("tar", ["-czf", out, "-C", root, ...Object.keys(files)]);
		return fs.readFileSync(out);
	};

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qc-gen-test-"));
		const bin = path.join(tmp, "bin");
		fs.mkdirSync(bin);
		argvLog = path.join(tmp, "docker-argv.log");
		fs.writeFileSync(
			path.join(bin, "docker"),
			`#!/bin/bash
echo "$@" >> "$FAKE_DOCKER_LOG"
case "$1" in
  pull|rm) exit 0;;
  run)
    out=""; prev=""
    for a in "$@"; do
      if [ "$prev" = "-v" ] && [[ "$a" == *:/out ]]; then out="\${a%:/out}"; fi
      prev="$a"
    done
    echo "fake container output"
    [ -n "$FAKE_RESULTS" ] && [ -n "$out" ] && printf '%s' "$FAKE_RESULTS" > "$out/results.json"
    ls "$out/../app/web/qc_generated" 2>/dev/null | sed 's/^/saw: /'
    exit \${FAKE_EXIT:-0};;
esac
`,
			{ mode: 0o755 },
		);
		originalPath = process.env.PATH;
		process.env.PATH = `${bin}:${originalPath}`;
		process.env.FAKE_DOCKER_LOG = argvLog;
		process.env.FAKE_EXIT = "0";
		process.env.FAKE_RESULTS = JSON.stringify({ numPassedTests: 2 });

		const code = getCodePath(appName);
		fs.mkdirSync(path.join(code, "web"), { recursive: true });
		fs.writeFileSync(path.join(code, "web", "package.json"), "{}");
	});

	afterEach(() => {
		process.env.PATH = originalPath;
		for (const key of ["FAKE_DOCKER_LOG", "FAKE_EXIT", "FAKE_RESULTS"]) {
			delete process.env[key];
		}
		fs.rmSync(getCodePath(appName), { recursive: true, force: true });
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	const run = (bundle: Buffer, m = manifest()) =>
		runGeneratedTests({ deploymentId: dep, appName, bundle, manifest: m });

	it("runs the tests in a container and reads back the exit code, results and log", async () => {
		const bundle = makeBundle({ "web/qc_generated/a.test.ts": "x" });
		const result = await run(bundle);

		expect(result.exitCode).toBe(0);
		expect(result.resultsJson).toEqual({ numPassedTests: 2 });
		expect(result.logTail).toContain("fake container output");
		expect(result.logTail).toContain("saw: a.test.ts"); // the bundle was extracted into the copy
		expect(result.durationSec).toBeGreaterThanOrEqual(0);

		const argv = fs.readFileSync(argvLog, "utf8");
		expect(argv).toContain("pull -q node:22");
		expect(argv).toMatch(/run --rm --name qc-exec-/);
		expect(argv).toContain("--network bridge");
		expect(argv).toContain("-w /app/web");
		expect(argv).toContain("sh -c npm ci && npx vitest run");
	});

	it("never touches the original source and removes its work directory", async () => {
		const bundle = makeBundle({ "web/qc_generated/a.test.ts": "x" });
		await run(bundle);
		expect(
			fs.existsSync(path.join(getCodePath(appName), "web", "qc_generated")),
		).toBe(false);
		expect(fs.existsSync(getWorkDir(dep))).toBe(false);
	});

	it("passes a failing test run's exit code through", async () => {
		process.env.FAKE_EXIT = "1";
		const result = await run(makeBundle({ "web/qc_generated/a.test.ts": "x" }));
		expect(result.exitCode).toBe(1);
		expect(result.resultsJson).toBeDefined();
	});

	it("passes a timeout through as exit code 124", async () => {
		process.env.FAKE_EXIT = "124";
		const result = await run(makeBundle({ "web/qc_generated/a.test.ts": "x" }));
		expect(result.exitCode).toBe(124);
	});

	it("keeps unparseable JSON results as text", async () => {
		process.env.FAKE_RESULTS = "{truncated";
		const result = await run(makeBundle({ "web/qc_generated/a.test.ts": "x" }));
		expect(result.resultsJson).toBeUndefined();
		expect(result.resultsText).toBe("{truncated");
	});

	it("sends non-JSON formats as text", async () => {
		const m = manifest({ resultsFormat: "go-test-json" });
		process.env.FAKE_RESULTS = '{"Action":"pass","Test":"TestA"}\n';
		const result = await run(
			makeBundle({ "web/qc_generated/a_test.go": "x" }),
			m,
		);
		expect(result.resultsText).toContain('"Test":"TestA"');
		expect(result.resultsJson).toBeUndefined();
	});

	it("uses the container's own output for the text format", async () => {
		const m = manifest({ resultsFormat: "text" });
		const result = await run(
			makeBundle({ "web/qc_generated/a.test.ts": "x" }),
			m,
		);
		expect(result.resultsText).toContain("fake container output");
	});

	it("gives a network-less container when nothing needs the network", async () => {
		const m = manifest({ install: "true", installNeedsNetwork: false });
		await run(makeBundle({ "web/qc_generated/a.test.ts": "x" }), m);
		expect(fs.readFileSync(argvLog, "utf8")).toContain("--network none");
	});

	it("refuses a bundle with an absolute path and never starts a container", async () => {
		const evil = path.join(tmp, "evil.txt");
		fs.writeFileSync(evil, "x");
		const bad = path.join(tmp, "bad.tgz");
		execFileSync("tar", ["-czPf", bad, evil]);

		await expect(run(fs.readFileSync(bad))).rejects.toThrow();
		const argv = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, "utf8") : "";
		expect(argv).not.toContain("run --rm");
		expect(fs.existsSync(getWorkDir(dep))).toBe(false);
	});

	it("fails when the application has no source copy to test", async () => {
		fs.rmSync(getCodePath(appName), { recursive: true, force: true });
		await expect(
			run(makeBundle({ "web/qc_generated/a.test.ts": "x" })),
		).rejects.toThrow();
		expect(fs.existsSync(getWorkDir(dep))).toBe(false);
	});
});
