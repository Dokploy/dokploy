import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execAsync } = vi.hoisted(() => ({ execAsync: vi.fn() }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync,
	execAsyncRemote: vi.fn(),
}));

import {
	cleanupAll,
	cleanupContainers,
	cleanupSystem,
} from "@dokploy/server/utils/docker/utils";

let binDir: string;

// Fake `docker` that answers `container inspect` with the given states and logs every other call.
const runWithFakeDocker = (script: string, states: Record<string, string>) => {
	const log = path.join(binDir, "calls.log");
	writeFileSync(log, "");
	const cases = Object.entries(states)
		.map(
			([name, running]) => `[ "$a" = "${name}" ] && echo ${running} && found=1`,
		)
		.join("; ");
	writeFileSync(
		path.join(binDir, "docker"),
		`#!/bin/sh
if [ "$1" = container ] && [ "$2" = inspect ]; then
	shift 4; status=0
	for a in "$@"; do found=; ${cases || ":"}; [ -z "$found" ] && echo "No such container: $a" >&2 && status=1; done
	exit $status
fi
echo "$*" >> "${log}"
`,
	);
	writeFileSync(path.join(binDir, "ps"), "#!/bin/sh\n");
	chmodSync(path.join(binDir, "docker"), 0o755);
	chmodSync(path.join(binDir, "ps"), 0o755);
	execFileSync("sh", ["-c", script], {
		env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
	});
	return readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
};

const commandOf = async (fn: () => Promise<unknown>) => {
	execAsync.mockClear();
	await fn();
	return execAsync.mock.calls.map(([command]) => command as string);
};

describe("docker cleanup keeps a stopped dokploy-traefik", () => {
	beforeEach(() => {
		binDir = mkdtempSync(path.join(tmpdir(), "fake-docker-"));
	});

	afterEach(() => {
		rmSync(binDir, { recursive: true, force: true });
	});

	it.each([
		["cleanupContainers", cleanupContainers, "container prune --force"],
		["cleanupSystem", cleanupSystem, "system prune --all --force"],
	])("%s skips pruning while Traefik is stopped", async (_, fn, prune) => {
		const [script] = await commandOf(() => fn());
		expect(runWithFakeDocker(script!, { "dokploy-traefik": "false" })).toEqual(
			[],
		);
		expect(
			runWithFakeDocker(script!, { "dokploy-traefik-previous": "false" }),
		).toEqual([]);
		expect(runWithFakeDocker(script!, { "dokploy-traefik": "true" })).toEqual([
			prune,
		]);
		expect(runWithFakeDocker(script!, {})).toEqual([prune]);
	});

	it("cleanupAll still prunes images and build cache while Traefik is stopped", async () => {
		const scripts = await commandOf(() => cleanupAll());
		const calls = scripts.flatMap((script) =>
			runWithFakeDocker(script, { "dokploy-traefik": "false" }),
		);
		expect(calls).toEqual([
			"image prune --all --force",
			"builder prune --all --force",
		]);
	});
});
