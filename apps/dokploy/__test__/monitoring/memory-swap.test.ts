import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	parseMacOsSwapUsage,
	readStatsFile,
	recordAdvancedStats,
} from "@dokploy/server/monitoring/utils";
import { afterEach, describe, expect, it } from "vitest";

const appName = "monitoring-swap-test";
const appMonitoringPath = path.join(paths().MONITORING_PATH, appName);

describe("memory swap monitoring", () => {
	afterEach(async () => {
		await fs.rm(appMonitoringPath, { recursive: true, force: true });
	});

	it("records swap usage with memory stats when swap data is available", async () => {
		await recordAdvancedStats(
			{
				BlockIO: "0B / 0B",
				CPUPerc: "0%",
				Container: "dokploy",
				ID: "host-system",
				MemPerc: "25.00%",
				MemUsage: "1.00GiB / 4.00GiB",
				Name: "dokploy",
				NetIO: "0MB / 0MB",
				SwapUsage: "512.00MiB / 2.00GiB",
			},
			appName,
		);

		const memoryStats = await readStatsFile(appName, "memory");

		expect(memoryStats).toHaveLength(1);
		expect(memoryStats[0].value).toEqual({
			used: "1.00GiB",
			total: "4.00GiB",
			swap: {
				used: "512.00MiB",
				total: "2.00GiB",
			},
		});
	});

	it("parses macOS sysctl swap output", () => {
		expect(
			parseMacOsSwapUsage(
				"total = 18432.00M  used = 16698.75M  free = 1733.25M  (encrypted)",
			),
		).toEqual({
			totalBytes: 18_432 * 1024 * 1024,
			usedBytes: 16_698.75 * 1024 * 1024,
		});
	});
});
