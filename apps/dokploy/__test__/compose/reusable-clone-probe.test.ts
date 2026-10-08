import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	getCloneCompleteCommand,
	getReusableCloneProbeCommand,
	REUSABLE_CLONE_ANSWER,
} from "@dokploy/server/utils/builders/compose-remote-build";

// Runs the real probe and marker commands through `sh` against real git
// repositories. Skipped where there is no sh or git (the CI runners have both).
const available = (command: string, args: string[]) =>
	spawnSync(command, args, { stdio: "ignore" }).status === 0;
const hasShellAndGit =
	available("sh", ["-c", "true"]) && available("git", ["--version"]);

const sh = (command: string) =>
	spawnSync("sh", ["-c", command], { encoding: "utf8" });
const git = (cwd: string, ...args: string[]) => {
	const result = spawnSync(
		"git",
		[
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@t",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{ cwd, encoding: "utf8" },
	);
	expect(result.status, result.stderr).toBe(0);
};

describe.skipIf(!hasShellAndGit)("reusable clone probe (real sh + git)", () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "reuse-probe-")));
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	const posix = (path: string) => path.replace(/\\/g, "/");
	const origin = join(root, "origin");
	mkdirSync(origin);
	git(origin, "init", "-q");
	git(origin, "commit", "-q", "--allow-empty", "-m", "init");

	const clone = (name: string, ...flags: string[]) => {
		const dir = join(root, name);
		git(root, "clone", "-q", ...flags, posix(origin), posix(dir));
		return dir;
	};
	const probe = (dir: string) =>
		sh(getReusableCloneProbeCommand(posix(dir))).stdout.includes(
			REUSABLE_CLONE_ANSWER,
		);
	const mark = (dir: string) => {
		expect(sh(getCloneCompleteCommand(posix(dir))).status).toBe(0);
	};

	it("accepts a finished clone that carries the completion marker", () => {
		const dir = clone("good");
		mark(dir);
		expect(probe(dir)).toBe(true);
	});

	it("rejects a clone killed before checkout (no marker, nothing checked out)", () => {
		const dir = clone("no-checkout", "--no-checkout");
		expect(probe(dir)).toBe(false);
	});

	it("rejects a good clone made before the marker existed", () => {
		const dir = clone("legacy");
		expect(probe(dir)).toBe(false);
	});

	it("rejects an empty directory inside an ancestor repository", () => {
		const parent = join(root, "ancestor");
		mkdirSync(parent);
		git(parent, "init", "-q");
		git(parent, "commit", "-q", "--allow-empty", "-m", "init");
		const dir = join(parent, "code");
		mkdirSync(dir);
		expect(probe(dir)).toBe(false);
	});

	it("rejects a marker in a directory that is only inside an ancestor repository", () => {
		const parent = join(root, "ancestor2");
		mkdirSync(parent);
		git(parent, "init", "-q");
		git(parent, "commit", "-q", "--allow-empty", "-m", "init");
		const dir = join(parent, "code");
		mkdirSync(join(dir, ".git"), { recursive: true });
		mark(dir);
		expect(probe(dir)).toBe(false);
	});

	it("rejects a missing directory", () => {
		expect(probe(join(root, "does-not-exist"))).toBe(false);
	});

	it("quotes a path with spaces and shell metacharacters", () => {
		const dir = clone("we ird; $(echo x)");
		mark(dir);
		expect(probe(dir)).toBe(true);
	});
});
