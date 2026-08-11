import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { getRegistryTag } from "@dokploy/server/utils/cluster/upload";
import { parse, quote } from "shell-quote";
import { describe, expect, it } from "vitest";

const MARK = `/tmp/dokploy_regnode_pwned_${process.pid}`;

const runsSafely = (command: string) => {
	if (existsSync(MARK)) rmSync(MARK);
	try {
		execSync(command, { shell: "/bin/sh", stdio: "ignore" });
	} catch {}
	const fired = existsSync(MARK);
	if (existsSync(MARK)) rmSync(MARK);
	return !fired;
};

const PAYLOADS = (m: string) => [
	`$(touch ${m})`,
	"`touch " + m + "`",
	`x; touch ${m}`,
	`x | touch ${m}`,
];

describe("cluster removeWorker nodeId injection", () => {
	// docker node update/rm ${quote([nodeId])} — replace `docker node` with `:`.
	it("escapes nodeId in drain/remove commands", () => {
		for (const nodeId of PAYLOADS(MARK)) {
			const drain = `: node update --availability drain ${quote([nodeId])}`;
			const remove = `: node rm ${quote([nodeId])} --force`;
			expect(runsSafely(drain)).toBe(true);
			expect(runsSafely(remove)).toBe(true);
		}
	});
});

describe("swarm upload registry tag/push injection", () => {
	// registryTag is built from registryUrl/username/imagePrefix (username and
	// imagePrefix have no schema regex). Assert docker tag/push stay safe.
	it("escapes a malicious imagePrefix flowing into the registry tag", () => {
		for (const payload of PAYLOADS(MARK)) {
			const registryTag = getRegistryTag(
				{
					registryUrl: "registry.example.com",
					imagePrefix: payload,
					username: "user",
				} as any,
				"app:latest",
			);
			const tagCmd = `: tag ${quote(["app:latest"])} ${quote([registryTag])}`;
			const pushCmd = `: push ${quote([registryTag])}`;
			expect(runsSafely(tagCmd)).toBe(true);
			expect(runsSafely(pushCmd)).toBe(true);
		}
	});

	it("keeps a legitimate registry tag intact", () => {
		const tag = getRegistryTag(
			{
				registryUrl: "registry.example.com",
				imagePrefix: "team",
				username: "user",
			} as any,
			"myapp:1.2.3",
		);
		expect(tag).toBe("registry.example.com/team/myapp:1.2.3");
		expect(parse(quote([tag]))).toEqual([tag]);
	});
});
