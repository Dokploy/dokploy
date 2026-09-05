import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { parse, quote } from "shell-quote";
import { afterEach, describe, expect, it } from "vitest";

// Reproduces the escaping applied at the docker build/pull sinks and asserts no
// payload can break out of the command. `docker`/`cd` are replaced by `:` so the
// test exercises only the injection surface, not real docker.
const MARK = `/tmp/dokploy_docker_pwned_${process.pid}`;

const runAndCheckSafe = (command: string) => {
	if (existsSync(MARK)) rmSync(MARK);
	try {
		execSync(command, { shell: "/bin/sh", stdio: "ignore" });
	} catch {
		// no-op stand-ins may exit non-zero; only the marker matters.
	}
	const fired = existsSync(MARK);
	if (existsSync(MARK)) rmSync(MARK);
	return !fired;
};

const PAYLOADS = [
	"$(touch %MARK%)",
	"`touch %MARK%`",
	"x; touch %MARK%",
	"x && touch %MARK%",
	"x | touch %MARK%",
];

describe("docker build/pull command injection", () => {
	it("dockerImage (buildRemoteDocker: docker pull / echo) is escaped", () => {
		for (const p of PAYLOADS) {
			const dockerImage = p.replace("%MARK%", MARK);
			const command = `: pull ${quote([dockerImage])}; : echo ${quote([`Pulling ${dockerImage}`])}`;
			expect(runAndCheckSafe(command)).toBe(true);
		}
	});

	it("dockerContextPath (docker-file: cd) is escaped", () => {
		for (const p of PAYLOADS) {
			const dockerContextPath = p.replace("%MARK%", MARK);
			const command = `: cd ${quote([dockerContextPath])}`;
			expect(runAndCheckSafe(command)).toBe(true);
		}
	});

	it("publishDirectory (nixpacks: docker cp source path) is escaped", () => {
		for (const p of PAYLOADS) {
			const publishDirectory = p.replace("%MARK%", MARK);
			const containerId = "buildabc";
			const command = `: cp ${quote([`${containerId}:/app/${publishDirectory}/.`])} /dest`;
			expect(runAndCheckSafe(command)).toBe(true);
		}
	});

	it("keeps a legitimate image / path intact as a single token", () => {
		// Escaping may add backslashes (e.g. before ':'), but the shell must parse
		// the result back to exactly the original single token.
		expect(parse(quote(["nginx:1.27-alpine"]))).toEqual(["nginx:1.27-alpine"]);
		expect(parse(quote(["registry.io/team/app:tag"]))).toEqual([
			"registry.io/team/app:tag",
		]);
		expect(parse(quote(["dist/static"]))).toEqual(["dist/static"]);
	});
});

describe("getDockerCommand full-string injection (real builder)", () => {
	// Generate the real `getDockerCommand(`) output, neutralise the
	// `docker build` invocation to a shell no-op (`:`) so real docker never
	// runs, then execute the whole script through /bin/sh. Every other shell
	// construct — the `cd` guard, `echo`, `|| { … }` error handling,
	// metacharacter parsing — runs verbatim. The test passes only if no
	// injected payload can create a marker file on disk, i.e. no
	// user-controlled field breaks out of the `docker build` argument list.
	const APP_NAME = `injapp_${process.pid}`;
	const codeDir = path.join(
		process.cwd(),
		".docker",
		"applications",
		APP_NAME,
		"code",
	);
	// Slash-free marker name so payloads can stay slash-free, mirroring the
	// real attack constraint that a literal `/` would trip the `cd` guard.
	const MARK_NAME = `pwned_df_${process.pid}`;

	const baseApp = (overrides: Record<string, unknown> = {}) =>
		({
			appName: APP_NAME,
			env: null,
			publishDirectory: null,
			buildArgs: null,
			buildSecrets: null,
			dockerBuildStage: null,
			cleanCache: false,
			createEnvFile: false,
			sourceType: "github",
			buildType: "dockerfile",
			buildPath: "",
			dockerfile: "Dockerfile",
			dockerContextPath: null,
			serverId: null,
			buildServerId: null,
			gitlabBuildPath: null,
			bitbucketBuildPath: null,
			giteaBuildPath: null,
			dropBuildPath: null,
			customGitBuildPath: null,
			environment: { project: { env: null }, env: null },
			...overrides,
		}) as any;

	const ensureCodeDir = () => {
		mkdirSync(codeDir, { recursive: true });
		writeFileSync(path.join(codeDir, "Dockerfile"), "FROM alpine\n");
	};

	// Replace only the `docker build -t` token with `:` (a shell no-op) so the
	// args are parsed by the shell but docker is never invoked. `:` ignores
	// its args and returns 0, so the `|| { …; exit 1; }` handler does not fire
	// — any marker that appears must have come from an injected
	// `;`/`|`/`$()`/backtick breaking out of the `docker build` args.
	const neutraliseDocker = (cmd: string) =>
		cmd.replace("docker build -t", ": build -t");

	const runAndCheckSafe = (app: any) => {
		ensureCodeDir();
		const mark = path.join(codeDir, MARK_NAME);
		if (existsSync(mark)) rmSync(mark);
		try {
			execSync(neutraliseDocker(getDockerCommand(app)), {
				shell: "/bin/sh",
				stdio: "ignore",
			});
		} catch {
			// The no-op stand-in and the `cd` guard may abort the script; only the
			// marker matters.
		}
		const fired = existsSync(mark);
		if (existsSync(mark)) rmSync(mark);
		return !fired;
	};

	afterEach(() => {
		rmSync(codeDir, { recursive: true, force: true });
	});

	it("dockerBuildStage (--target) single-field payload does not fire", () => {
		const app = baseApp({ dockerBuildStage: `x; touch ${MARK_NAME}; #` });
		expect(runAndCheckSafe(app)).toBe(true);
	});

	it("dockerfile (-f) slash-free payload does not fire", () => {
		const app = baseApp({ dockerfile: `Dockerfile; touch ${MARK_NAME}; #` });
		expect(runAndCheckSafe(app)).toBe(true);
	});

	it("dockerContextPath + dockerfile two-field payload does not fire", () => {
		const app = baseApp({
			dockerContextPath: ".",
			dockerfile: `Dockerfile; touch ${MARK_NAME}; #`,
		});
		expect(runAndCheckSafe(app)).toBe(true);
	});

	it("customGitBuildPath (*BuildPath) two-field payload does not fire", () => {
		const app = baseApp({
			sourceType: "git",
			customGitBuildPath: `seg; touch ${MARK_NAME}; #`,
			dockerContextPath: ".",
		});
		expect(runAndCheckSafe(app)).toBe(true);
	});

	it("preserves legitimate build values as single tokens (no over-escaping)", () => {
		ensureCodeDir();
		const app = baseApp({
			sourceType: "git",
			customGitBuildPath: "repo/sub",
			dockerfile: "Dockerfile.prod",
			dockerBuildStage: "builder-node",
			dockerContextPath: "apps/web",
		});
		const cmd = getDockerCommand(app);
		expect(cmd).toContain("docker build -t");
		// Legitimate values contain no shell metacharacters, so shell-quote
		// leaves them untouched and the build still receives the original args.
		expect(cmd).toContain("--target builder-node");
		expect(cmd).toContain("Dockerfile.prod");
		expect(cmd).toContain("repo/sub");
		expect(cmd).toContain("apps/web");
		// The build stage must round-trip through the shell as a single literal
		// token, never as shell operators.
		const buildLine =
			cmd
				.split("\n")
				.find((l) => l.includes("docker build"))
				?.trim() ?? "";
		expect(parse(buildLine)).toContain("builder-node");
	});
});
