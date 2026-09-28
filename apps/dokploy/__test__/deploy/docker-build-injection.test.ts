import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

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
