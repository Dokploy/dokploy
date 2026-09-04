import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getHerokuCommand } from "@dokploy/server/utils/builders/heroku";
import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

// Regression tests for the shell-injection sinks in the Railpack and Heroku
// builders. `application.railpackVersion` / `application.herokuVersion` are
// user-controlled strings that get spliced into a bash script executed by
// `/bin/sh -c` (or over SSH). They must be quoted at the sink so a value like
// `0.15.4; touch /tmp/x` becomes a single-quoted, inert token instead of two
// runnable statements.

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "test-app",
		buildType: "railpack",
		sourceType: "git",
		buildPath: "/",
		railpackVersion: "0.15.4",
		herokuVersion: "24",
		env: "TEST_VAR=one",
		cleanCache: false,
		environment: {
			project: {
				env: "",
			},
			env: "",
		},
		...overrides,
	}) as unknown as ApplicationNested;

// Payloads that would execute `touch <MARK>` if spliced unquoted into a bash
// line. Kept free of the words docker/curl/railpack/sudo/pack/bash so the
// neutralizer below never accidentally rewrites the injected command.
const buildPayloads = (mark: string): string[] => [
	`0.15.4; touch ${mark}`,
	`0.15.4$(touch ${mark})`,
	`0.15.4\`touch ${mark}\``,
	`0.15.4 && touch ${mark}`,
	`0.15.4 | touch ${mark}`,
];

// Replace the external binaries the script invokes with no-op stand-ins so the
// generated script can be executed by a real /bin/sh without reaching out to
// docker/railpack/curl/pack. Only line-leading command tokens are rewritten, so
// the same-named substrings inside paths (e.g. railpack-plan.json) are preserved.
const neutralizeExternals = (script: string): string =>
	script
		.replace(/(^|\n)(\s*)docker(\s)/g, "$1$2:$3")
		.replace(/(^|\n)(\s*)railpack(\s)/g, "$1$2:$3")
		.replace(/(^|\n)(\s*)pack(\s)/g, "$1$2:$3")
		.replace(/\bcurl\b/g, "true")
		.replace(/\bsudo\b/g, "true");

// Run the (neutralized) full builder script through a real POSIX shell and
// report whether the injected marker file was created. Mirrors how the build
// command is executed in production: `execAsync` => `child_process.exec` =>
// `/bin/sh -c "<script>"`, wrapped in `set -e;`.
const runScriptAndCheckInjection = (
	script: string,
	mark: string,
): { fired: boolean; stdout: string; stderr: string } => {
	if (existsSync(mark)) rmSync(mark);
	const tmp = mkdtempSync(join(tmpdir(), "dokploy-inj-"));
	const scriptPath = join(tmp, "build.sh");
	try {
		writeFileSync(scriptPath, `set -e;\n${script}`);
		let stdout = "";
		let stderr = "";
		try {
			stdout = execFileSync("/bin/sh", [scriptPath], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				timeout: 30_000,
			});
		} catch (err) {
			stderr = (err as { stderr?: string }).stderr ?? "";
			stdout = (err as { stdout?: string }).stdout ?? "";
		}
		const fired = existsSync(mark);
		if (existsSync(mark)) rmSync(mark);
		return { fired, stdout, stderr };
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
};

describe("railpack version command injection", () => {
	it("quotes railpackVersion in the `export RAILPACK_VERSION` assignment", () => {
		const command = getRailpackCommand(
			createApplication({ railpackVersion: "0.15.4; touch /tmp/pwned" }),
		);
		expect(command).toContain(
			"export RAILPACK_VERSION='0.15.4; touch /tmp/pwned'",
		);
		expect(command).not.toMatch(
			/export RAILPACK_VERSION=0\.15\.4;\s*touch \/tmp\/pwned/,
		);
	});

	it("quotes railpackVersion in the BUILDKIT_SYNTAX build-arg", () => {
		const command = getRailpackCommand(
			createApplication({ railpackVersion: "0.15.4; touch /tmp/pwned" }),
		);
		expect(command).toContain(
			"BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v'0.15.4; touch /tmp/pwned'",
		);
		expect(command).not.toMatch(
			/BUILDKIT_SYNTAX=ghcr\.io\/railwayapp\/railpack-frontend:v0\.15\.4;\s*touch/,
		);
	});

	it("leaves a legitimate semver railpackVersion unquoted and intact", () => {
		const command = getRailpackCommand(
			createApplication({ railpackVersion: "0.15.4" }),
		);
		expect(command).toContain("export RAILPACK_VERSION=0.15.4");
		expect(command).toContain(
			"BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v0.15.4",
		);
		expect(parse(quote(["0.15.4"]))).toEqual(["0.15.4"]);
	});

	it("round-trips an injected version through shell-quote back to one token", () => {
		const injected = "0.15.4; touch /tmp/pwned";
		expect(parse(quote([injected]))).toEqual([injected]);
	});

	it("handles a null railpackVersion as an empty quoted value", () => {
		const command = getRailpackCommand(
			createApplication({ railpackVersion: null as unknown as string }),
		);
		expect(command).toContain("export RAILPACK_VERSION=''");
		expect(command).toContain(
			"BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v'",
		);
	});

	it.each(buildPayloads("/tmp/dokploy_railpack_pwned"))(
		"does not execute the injected command for railpack payload %j",
		(payload) => {
			const mark = "/tmp/dokploy_railpack_pwned";
			const command = getRailpackCommand(
				createApplication({ railpackVersion: payload }),
			);
			// Sanity: the payload (unquoted form) must NOT appear as a bare runnable
			// statement in the generated script — it must live inside single quotes.
			const unquotedForm = payload.replace(/`/g, "\\`");
			const withoutQuoted = command.replace(/'[^']*'/g, "");
			expect(withoutQuoted).not.toContain(`touch ${mark}`);
			expect(withoutQuoted).not.toContain(unquotedForm);

			const { fired } = runScriptAndCheckInjection(
				neutralizeExternals(command),
				mark,
			);
			expect(fired).toBe(false);
		},
	);

	it("does not fire when railpackVersion contains a path-separator-free command substitution", () => {
		const mark = "/tmp/dokploy_railpack_pwned2";
		const command = getRailpackCommand(
			createApplication({ railpackVersion: `0.15.4$(touch ${mark})` }),
		);
		const { fired } = runScriptAndCheckInjection(
			neutralizeExternals(command),
			mark,
		);
		expect(fired).toBe(false);
	});
});

describe("heroku version command injection", () => {
	it("quotes herokuVersion in the `--builder` argument", () => {
		const command = getHerokuCommand(
			createApplication({
				buildType: "heroku_buildpacks",
				herokuVersion: "24; touch /tmp/pwned",
			}),
		);
		expect(command).toContain(
			"--builder heroku/builder:'24; touch /tmp/pwned'",
		);
		expect(command).not.toMatch(
			/--builder heroku\/builder:24;\s*touch \/tmp\/pwned/,
		);
	});

	it("leaves a legitimate integer herokuVersion unquoted", () => {
		const command = getHerokuCommand(
			createApplication({
				buildType: "heroku_buildpacks",
				herokuVersion: "24",
			}),
		);
		expect(command).toContain("--builder heroku/builder:24");
		expect(parse(quote(["24"]))).toEqual(["24"]);
	});

	it("falls back to the default `24` for an empty herokuVersion", () => {
		const command = getHerokuCommand(
			createApplication({ buildType: "heroku_buildpacks", herokuVersion: "" }),
		);
		expect(command).toContain("--builder heroku/builder:24");
	});

	it.each(buildPayloads("/tmp/dokploy_heroku_pwned"))(
		"does not execute the injected command for heroku payload %j",
		(payload) => {
			const mark = "/tmp/dokploy_heroku_pwned";
			const command = getHerokuCommand(
				createApplication({
					buildType: "heroku_buildpacks",
					herokuVersion: payload,
				}),
			);
			const withoutQuoted = command.replace(/'[^']*'/g, "");
			expect(withoutQuoted).not.toContain(`touch ${mark}`);

			const { fired } = runScriptAndCheckInjection(
				neutralizeExternals(command),
				mark,
			);
			expect(fired).toBe(false);
		},
	);
});
