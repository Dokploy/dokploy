import { classifyFailure } from "@dokploy/server/utils/deployment-failure-classifier";
import { describe, expect, test } from "vitest";

describe("classifyFailure", () => {
	test("returns null for empty/null/undefined input", () => {
		expect(classifyFailure(null)).toBeNull();
		expect(classifyFailure(undefined)).toBeNull();
		expect(classifyFailure("")).toBeNull();
	});

	test("returns null when nothing matches", () => {
		expect(classifyFailure("Build succeeded, deploying now")).toBeNull();
	});

	test.each([
		[
			"inotify-limit",
			"Error: ENOSPC: System limit for number of file watchers reached, inotify watch limit reached",
		],
		[
			"oom",
			"Container killed process, out of memory: Kill process 1234 (node) score",
		],
		[
			"address-pool-exhausted",
			"Error response from daemon: could not find an available, non-overlapping IPv4 address pool among the defaults to assign to the network",
		],
		[
			"network-ip-exhausted",
			'time="2026-08-12T19:10:14Z" level=error msg="task allocation failure" error="failed to allocate network IP for task kow0rt7j4nk166qill9vgb6gw network cuz8knvfyobvqsp10yvh39iu7: could not find an available IP"',
		],
		[
			"network-attach-timeout",
			"Error response from daemon: failed to set up container networking: attaching to network failed, make sure your network options are correct and check manager logs: context deadline exceeded",
		],
		["disk-full", "write /var/lib/docker/tmp/x: no space left on device"],
		["conntrack-full", "nf_conntrack: table full, dropping packet"],
		["fd-limit", "accept4: too many open files"],
		["pid-limit", "fork: retry: Resource temporarily unavailable"],
	])("classifies %s pattern", (expectedId, logLine) => {
		expect(classifyFailure(logLine)?.id).toBe(expectedId);
	});

	test("network-ip-exhausted and address-pool-exhausted stay distinct", () => {
		const poolExhausted =
			"could not find an available, non-overlapping IPv4 address pool";
		const ipExhausted = "could not find an available IP";
		expect(classifyFailure(poolExhausted)?.id).toBe("address-pool-exhausted");
		expect(classifyFailure(ipExhausted)?.id).toBe("network-ip-exhausted");
	});

	test("matches case-insensitively", () => {
		expect(classifyFailure("NO SPACE LEFT ON DEVICE")?.id).toBe("disk-full");
	});
});
