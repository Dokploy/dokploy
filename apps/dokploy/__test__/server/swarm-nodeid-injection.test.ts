import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { quote } from "shell-quote";
import { describe, expect, it } from "vitest";

// Mirrors how getNodeInfo builds its command in services/docker.ts:
//   `docker node inspect ${quote([nodeId])} --format '{{json .}}'`
// We swap `docker node inspect` for `:` (a no-op) so the test only exercises
// whether the nodeId payload can break out of the command, not real docker.
const buildCommand = (nodeId: string) =>
	`: node inspect ${quote([nodeId])} --format '{{json .}}'`;

const INJECTION_NODE_IDS = [
	"$(touch %MARK%)",
	"`touch %MARK%`",
	"; touch %MARK%",
	"abc | touch %MARK%",
	"&& touch %MARK%",
];

describe("getNodeInfo nodeId command injection", () => {
	it("does not execute injected commands from the nodeId", () => {
		const mark = `/tmp/dokploy_swarm_pwned_${process.pid}`;
		for (const template of INJECTION_NODE_IDS) {
			if (existsSync(mark)) rmSync(mark);
			const nodeId = template.replace("%MARK%", mark);
			try {
				execSync(buildCommand(nodeId), { shell: "/bin/sh", stdio: "ignore" });
			} catch {
				// A non-zero exit from the no-op is fine; we only care about the marker.
			}
			expect(existsSync(mark)).toBe(false);
		}
		if (existsSync(mark)) rmSync(mark);
	});

	it("keeps a legitimate node id intact as a single literal token", () => {
		const nodeId = "abc123def456";
		expect(quote([nodeId])).toBe(nodeId);
	});
});
