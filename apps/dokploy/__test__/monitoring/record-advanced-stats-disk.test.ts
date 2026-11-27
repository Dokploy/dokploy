import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Container } from "@dokploy/server";
import { recordAdvancedStats } from "@dokploy/server/monitoring/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { monitoringPath, usageByMountPoint } = vi.hoisted(() => ({
	monitoringPath: { value: "" },
	usageByMountPoint: vi.fn(),
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: (...args: Parameters<typeof actual.paths>) => ({
			...actual.paths(...args),
			MONITORING_PATH: monitoringPath.value,
		}),
	};
});

vi.mock("node-os-utils", () => ({
	OSUtils: class {
		disk = { usageByMountPoint };
	},
}));

const sample: Container = {
	BlockIO: "1MB / 2MB",
	CPUPerc: "1.25%",
	Container: "dokploy",
	ID: "dokploy",
	MemPerc: "18.75%",
	MemUsage: "12MiB / 64MiB",
	Name: "dokploy",
	NetIO: "1MB / 2MB",
};

const diskReading = {
	success: true,
	data: {
		used: { toGB: () => 40 },
		total: { toGB: () => 100 },
		available: { toGB: () => 60 },
		usagePercentage: 40,
	},
};

describe("recordAdvancedStats disk readings", () => {
	beforeEach(async () => {
		monitoringPath.value = await mkdtemp(join(tmpdir(), "dokploy-stats-"));
		usageByMountPoint.mockReset();
	});

	afterEach(async () => {
		await rm(monitoringPath.value, { recursive: true, force: true });
	});

	it("keeps the last disk reading when the disk probe fails", async () => {
		usageByMountPoint.mockResolvedValueOnce(diskReading);
		const first = await recordAdvancedStats(sample, "dokploy");

		usageByMountPoint.mockResolvedValueOnce({ success: false });
		const second = await recordAdvancedStats(sample, "dokploy");

		expect(first.disk?.value).toEqual({
			diskTotal: 100,
			diskUsedPercentage: 40,
			diskUsage: 40,
			diskFree: 60,
		});
		expect(JSON.stringify(second.disk)).toBe(JSON.stringify(first.disk));
	});

	it("returns no disk reading when the probe fails before any was saved", async () => {
		usageByMountPoint.mockResolvedValueOnce({ success: false });

		const result = await recordAdvancedStats(sample, "dokploy");

		expect(result.disk).toBeNull();
	});
});
