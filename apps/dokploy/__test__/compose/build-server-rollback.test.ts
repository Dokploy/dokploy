import {
	getBuildComposeCommand,
	getRestoreAfterFailedBuildCommand,
} from "@dokploy/server/utils/builders/compose";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quote } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

/**
 * A compose with a build server promises its serving host never builds. The
 * automatic rollback (the restore that runs when a deploy fails) used to bring
 * a release that predates the build server back with a plain `up`, which
 * builds any service whose image was pruned in the meantime. These tests pin
 * the restore to `--no-build`, and pin a compose without a build server to the
 * exact restore line it has always had.
 */

vi.mock("@dokploy/server/utils/docker/domain", () => ({
	writeDomainsToCompose: vi.fn().mockResolvedValue(""),
}));

const base = {
	appName: "my-app",
	sourceType: "raw",
	command: "",
	composePath: "docker-compose.yml",
	composeType: "docker-compose",
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
	serverId: null,
	env: "",
	mounts: [],
	domains: [],
	buildServerId: "build-1",
	buildRegistryId: "reg-1",
	buildServer: { serverId: "build-1", name: "devino-third" },
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getBuildComposeCommand>[0];

const noBuildServer = {
	...base,
	buildServerId: null,
	buildRegistryId: null,
	buildServer: null,
} as unknown as typeof base;

const remoteBuild = {
	images: [{ service: "web", image: "reg.example.com/acme/my-app-web:dpl-9" }],
	servingHostLabel: "prod-1",
};

/** Every `docker compose ... up` invocation in a script, one per match. */
const upInvocations = (script: string) =>
	script.match(/docker compose [^\n]*? up -d[^\n]*/g) ?? [];

/** The two `up` lines of the restore, picked by their OVERRIDE_RESTORED guard. */
const restoreBranches = (restore: string) => {
	const lines = restore.split("\n");
	const guard = lines.findIndex((line) =>
		line.includes('if [ "$OVERRIDE_RESTORED" = "1" ]; then'),
	);
	expect(guard).toBeGreaterThan(-1);
	const elseLine = lines.findIndex(
		(line, i) => i > guard && line.trim() === "else",
	);
	expect(elseLine).toBeGreaterThan(guard);
	const fiLine = lines.findIndex(
		(line, i) => i > elseLine && line.trim() === "fi",
	);
	expect(fiLine).toBeGreaterThan(elseLine);
	return {
		withOverride: upInvocations(lines.slice(guard + 1, elseLine).join("\n"))[0],
		noOverride: upInvocations(lines.slice(elseLine + 1, fiLine).join("\n"))[0],
	};
};

const TAIL_START = 'if [ "$RESTORE_FILES_OK" = "1" ]; then';
/** The final `if [ "$RESTORE_FILES_OK" = "1" ]; then ... fi` block, nothing after it. */
const restoreTail = (restore: string) => {
	const at = restore.lastIndexOf(TAIL_START);
	expect(at).toBeGreaterThan(-1);
	const end = restore.indexOf("\n\t\tfi", at);
	expect(end).toBeGreaterThan(at);
	return restore.slice(at, end + "\n\t\tfi".length);
};

const restorePart = (script: string) => {
	const start = script.indexOf("Restoring previous working deployment");
	expect(start).toBeGreaterThan(-1);
	return script.slice(start);
};

describe("compose rollback on a unit with a build server", () => {
	it("restores a release with a build override from the registry images, never building", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);

		// The override-restored branch re-runs the deploy command: --no-build and
		// the override are both there.
		expect(restore).toContain('if [ "$OVERRIDE_RESTORED" = "1" ]; then');
		const ups = upInvocations(restore);
		expect(ups.length).toBe(2);
		for (const up of ups) {
			expect(up).toContain("--no-build");
			expect(up).not.toMatch(/ --build\b/);
		}
		expect(ups[0]).toContain("docker-compose.dokploy-build.yml");
	});

	it("restores a release that predates the build server with --no-build, not a plain up", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		// The branch taken when no build override could be put back.
		const plain = restoreBranches(restorePart(script)).noOverride;

		expect(plain).toBeDefined();
		expect(plain).toContain("--no-build");
		expect(plain).toContain("--remove-orphans");
		// And it really is the override-less command.
		expect(plain).not.toContain("docker-compose.dokploy-build.yml");
	});

	it("never emits an `up` without --no-build anywhere in the script", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const ups = upInvocations(script);
		expect(ups.length).toBeGreaterThanOrEqual(3);
		for (const up of ups) expect(up).toContain("--no-build");
	});

	it("fails with a neutral warning naming the build server when the no-override restore fails", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);

		expect(restore).toContain(
			"Warning: ⚠️ Automatic restore failed. The serving host never builds images (build server devino-third). If this release's images were pruned, redeploy to rebuild them on build server devino-third; otherwise manual intervention may be required. Some services may already be restarted.",
		);
		// Neutral: it must not claim the release predates the build server.
		expect(restore).not.toContain("before builds moved");
		// Same severity as the sibling OVERRIDE_RESTORED=1 failure branch.
		expect(restore).not.toContain("Error: ❌ This release");
	});

	it("falls back to a generic name when the build server was not loaded", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, buildServer: undefined } as typeof base,
			{ deploymentId: "dep1", remoteBuild },
		);
		expect(restorePart(script)).toContain(
			"never builds images (the build server). If this release's images were pruned, redeploy to rebuild them on the build server;",
		);
	});

	it("keeps --no-build in both restore branches when no service had a build section", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild: { images: [], servingHostLabel: "prod-1" },
		});
		expect(script).not.toContain("docker pull");
		const restore = restorePart(script);
		const { withOverride, noOverride } = restoreBranches(restore);
		for (const up of [withOverride, noOverride]) {
			expect(up).toBeDefined();
			expect(up).toContain("--no-build");
			expect(up).not.toMatch(/ --build\b/);
		}
		for (const up of upInvocations(script)) expect(up).toContain("--no-build");
		expect(restore).toContain("never builds images (build server devino-third)");
	});

	it("quotes a build server name so it cannot break out of the echo", async () => {
		const evil = "x\"; touch /tmp/pwned; echo \"$(id) `id`";
		const script = await getBuildComposeCommand(
			{
				...base,
				buildServer: { serverId: "build-1", name: evil },
			} as typeof base,
			{ deploymentId: "dep1", remoteBuild },
		);
		const restore = restorePart(script);
		// The whole message is one shell-quote'd word, so the metacharacters in
		// the name (quote, ;, $(), backtick) stay literal text.
		const label = `build server ${evil}`;
		const message = `Warning: ⚠️ Automatic restore failed. The serving host never builds images (${label}). If this release's images were pruned, redeploy to rebuild them on ${label}; otherwise manual intervention may be required. Some services may already be restarted.`;
		expect(restore).toContain(`echo ${quote([message])};`);
	});

	it("keeps the marker so a successful --no-build restore still counts as rolled back", async () => {
		const script = await getBuildComposeCommand(base, {
			deploymentId: "dep1",
			remoteBuild,
		});
		const restore = restorePart(script);
		expect(restore.match(/__DOKPLOY_ROLLBACK_OK__\\?:dep1/g)).toHaveLength(2);
	});

	it("uses --no-build in the restore that follows a failed build on the build server", async () => {
		const restore = await getRestoreAfterFailedBuildCommand(base, {
			deploymentId: "dep1",
		});
		const ups = upInvocations(restore);
		expect(ups.length).toBe(2);
		for (const up of ups) expect(up).toContain("--no-build");
		expect(restore).toContain("never builds images (build server devino-third)");
	});

	it("also pins the restore when the compose pulls images on deploy", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, pullImagesOnDeploy: true } as typeof base,
			{ deploymentId: "dep1", remoteBuild },
		);
		const restore = restorePart(script);
		// --pull always is stripped from the restore (it is often what broke the
		// deploy); --no-build must survive the stripping.
		for (const up of upInvocations(restore)) {
			expect(up).toContain("--no-build");
			expect(up).not.toContain("--pull always");
		}
	});

	it("has no restore for a swarm stack (declarative, never builds)", async () => {
		const script = await getBuildComposeCommand(
			{ ...base, composeType: "stack" } as typeof base,
			{ deploymentId: "d", remoteBuild },
		);
		expect(script).not.toContain("Restoring previous working deployment");
		expect(script).toContain("stack deploy");
		expect(script).toContain("--with-registry-auth");
	});
});

describe("compose rollback on a unit without a build server", () => {
	it("restores exactly as before: a plain up, the generic failure line, no override logic", async () => {
		const script = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		const restore = restorePart(script);

		expect(restore).not.toContain("--no-build");
		expect(restore).not.toContain("OVERRIDE_RESTORED");
		expect(restore).not.toContain("docker-compose.dokploy-build.yml");
		expect(restore).not.toContain("before builds moved to");
		expect(restore).toMatch(
			/ up -d --remove-orphans 2>&1 && echo \S+ \|\| echo "Warning: ⚠️ Automatic restore failed, manual intervention may be required";/,
		);
	});

	it("emits the exact restore tail it always has (golden)", async () => {
		const script = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		const restore = restorePart(script);
		expect(restoreTail(restore)).toBe(
			[
				'if [ "$RESTORE_FILES_OK" = "1" ]; then',
				'\t\t\tenv -i PATH="$PATH" HOME="$HOME"  docker compose -p my-app -f docker-compose.yml up -d --remove-orphans 2>&1 && echo __DOKPLOY_ROLLBACK_OK__\\:dep1 || echo "Warning: ⚠️ Automatic restore failed, manual intervention may be required";',
				"\t\telse",
				'\t\t\techo "Warning: ⚠️ No previous release to restore, leaving the stack as-is";',
				"\t\tfi",
			].join("\n"),
		);
	});

	it("still builds on deploy, since it has no build server", async () => {
		const script = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		const deployUp = upInvocations(script)[0];
		expect(deployUp).toContain("--build");
		expect(deployUp).not.toContain("--no-build");
	});

	it("is byte-identical whether or not a buildServer relation is loaded", async () => {
		const withRelation = await getBuildComposeCommand(
			{ ...noBuildServer, buildServer: { serverId: "x", name: "n" } } as never,
			{ deploymentId: "dep1" },
		);
		const without = await getBuildComposeCommand(noBuildServer, {
			deploymentId: "dep1",
		});
		expect(withRelation).toBe(without);
	});
});

/**
 * Runs the generated restore tail under a real shell with a stub `docker`, so
 * the assertion is about what executes rather than about the text of the script.
 */
// On Windows a bare `bash` is usually WSL, which cannot see the stub: prefer Git Bash.
const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
const BASH =
	process.platform === "win32" && existsSync(GIT_BASH) ? GIT_BASH : "bash";
const hasBash = spawnSync(BASH, ["-c", "true"]).status === 0;

describe.skipIf(!hasBash)(
	"restore script executed under bash with a stub docker",
	() => {
		const run = (
			restore: string,
			opts: { upSucceeds: boolean; override: "0" | "1" },
		) => {
			const dir = mkdtempSync(join(tmpdir(), "stub-docker-"));
			// Git Bash wants /c/Users/... in PATH, not C:/Users/...
			const posixDir = dir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1");
			try {
				const stub = [
					"#!/bin/sh",
					`echo "$@" >> '${posixDir}/calls.log'`,
					// Any `up` fails, as it would on a registry outage or port conflict.
					opts.upSucceeds
						? "exit 0"
						: 'case " $* " in *" up "*) exit 1;; esac; exit 0',
					"",
				].join("\n");
				writeFileSync(join(dir, "docker"), stub, { mode: 0o755 });
				const tail = restoreTail(restore);
				// Script goes over stdin: Windows argv quoting mangles the embedded quotes.
				const result = spawnSync(BASH, ["-s"], {
					input: `RESTORE_FILES_OK=1; OVERRIDE_RESTORED=${opts.override}; ${tail}\n`,
					env: {
						...process.env,
						PATH: `${posixDir}:${process.env.PATH}`,
						HOME: posixDir,
					},
					encoding: "utf8",
				});
				const logFile = join(dir, "calls.log");
				const calls = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
				return { stdout: result.stdout, calls };
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		};

		it.each(["0", "1"] as const)(
			"a failing up (override restored=%s) emits no rollback marker and never builds",
			async (override) => {
				const script = await getBuildComposeCommand(base, {
					deploymentId: "dep1",
					remoteBuild,
				});
				const { stdout, calls } = run(restorePart(script), {
					upSucceeds: false,
					override,
				});
				expect(calls).toContain(" up ");
				expect(stdout).not.toContain("__DOKPLOY_ROLLBACK_OK__");
				expect(stdout).toContain("Automatic restore failed");
				for (const line of calls.trim().split("\n")) {
					expect(line).toContain("--no-build");
					expect(line).not.toMatch(/--build\b/);
				}
			},
		);

		it("emits the rollback marker when the --no-build up succeeds", async () => {
			const script = await getBuildComposeCommand(base, {
				deploymentId: "dep1",
				remoteBuild,
			});
			const { stdout, calls } = run(restorePart(script), {
				upSucceeds: true,
				override: "0",
			});
			expect(stdout).toContain("__DOKPLOY_ROLLBACK_OK__:dep1");
			expect(calls).toContain("--no-build");
		});
	},
);
