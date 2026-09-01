import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

// The six database deploy functions (postgres/mysql/mariadb/mongo/redis/libsql)
// build `docker pull ${quote([dockerImage])}` for the remote (execAsyncRemote)
// path. `docker` is replaced by `:` so only the injection surface is exercised.
const MARK = `/tmp/dokploy_dbimg_pwned_${process.pid}`;

const PAYLOADS = [
	"$(touch %MARK%)",
	"`touch %MARK%`",
	"redis:7; touch %MARK%",
	"redis:7 && touch %MARK%",
	"redis:7 | touch %MARK%",
];

describe("database service dockerImage command injection", () => {
	it("does not execute injected commands from dockerImage", () => {
		for (const template of PAYLOADS) {
			if (existsSync(MARK)) rmSync(MARK);
			const dockerImage = template.replace("%MARK%", MARK);
			const command = `: pull ${quote([dockerImage])}`;
			try {
				execSync(command, { shell: "/bin/sh", stdio: "ignore" });
			} catch {}
			expect(existsSync(MARK)).toBe(false);
		}
		if (existsSync(MARK)) rmSync(MARK);
	});

	it("keeps a legitimate image tag intact", () => {
		expect(parse(quote(["postgres:16.4-alpine"]))).toEqual([
			"postgres:16.4-alpine",
		]);
		expect(parse(quote(["ghcr.io/org/db:latest"]))).toEqual([
			"ghcr.io/org/db:latest",
		]);
	});
});
