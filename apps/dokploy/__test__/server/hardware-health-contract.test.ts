import { parseServerHardware } from "@dokploy/server/services/server-hardware";
import { buildHardwareScripts } from "@dokploy/server/services/server-hardware-scripts";
import { describe, expect, it } from "vitest";

describe("Health hardware contract", () => {
	it("returns only supplementary hardware facts when legacy resource fields are supplied", () => {
		const result = parseServerHardware(
			JSON.stringify({
				kind: "remote",
				arch: "aarch64",
				cpuCount: "8",
				memTotalKb: "1024",
				diskTotalK: "4096",
				gpuExit: 0,
			}),
		);
		expect(result).toMatchObject({
			architecture: "aarch64",
			gpu: { detection: "available", devices: [] },
		});
		expect(result).not.toHaveProperty("cpu");
		expect(result).not.toHaveProperty("memory");
		expect(result).not.toHaveProperty("disk");
	});

	it.each([false, true])(
		"does not collect resource totals when remote=%s",
		(remote) => {
			const scripts = buildHardwareScripts(remote);
			expect(scripts).toHaveLength(3);
			expect(scripts.join("\n")).not.toMatch(
				/nproc|cpuinfo|meminfo|df -P|\.NCPU|\.MemTotal/,
			);
		},
	);
});
