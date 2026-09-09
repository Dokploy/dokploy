import { shouldIncludeDiskStat } from "@dokploy/server/monitoring/utils";
import { describe, expect, it } from "vitest";

describe("shouldIncludeDiskStat", () => {
	it("excludes partitions when their parent disk is present (every byte would be counted twice)", () => {
		// /proc/diskstats lists partition I/O in both the partition row and the
		// parent disk row; summing both double-counts.
		const devices = ["sda", "sda1", "sda2", "sdb", "sdb1"];
		expect(shouldIncludeDiskStat("sda", devices)).toBe(true);
		expect(shouldIncludeDiskStat("sdb", devices)).toBe(true);
		expect(shouldIncludeDiskStat("sda1", devices)).toBe(false);
		expect(shouldIncludeDiskStat("sda2", devices)).toBe(false);
		expect(shouldIncludeDiskStat("sdb1", devices)).toBe(false);
	});

	it("handles nvme/mmc/md partition naming (pN suffix)", () => {
		const devices = [
			"nvme0n1",
			"nvme0n1p1",
			"nvme0n1p2",
			"mmcblk0",
			"mmcblk0p1",
		];
		expect(shouldIncludeDiskStat("nvme0n1", devices)).toBe(true);
		expect(shouldIncludeDiskStat("nvme0n1p1", devices)).toBe(false);
		expect(shouldIncludeDiskStat("nvme0n1p2", devices)).toBe(false);
		expect(shouldIncludeDiskStat("mmcblk0", devices)).toBe(true);
		expect(shouldIncludeDiskStat("mmcblk0p1", devices)).toBe(false);
	});

	it("keeps whole disks whose names end in a digit", () => {
		const devices = ["nvme0n1", "mmcblk0"];
		expect(shouldIncludeDiskStat("nvme0n1", devices)).toBe(true);
		expect(shouldIncludeDiskStat("mmcblk0", devices)).toBe(true);
	});

	it("excludes virtual devices", () => {
		const devices = ["loop0", "loop1", "ram0", "sr0", "sda"];
		expect(shouldIncludeDiskStat("loop0", devices)).toBe(false);
		expect(shouldIncludeDiskStat("ram0", devices)).toBe(false);
		expect(shouldIncludeDiskStat("sr0", devices)).toBe(false);
		expect(shouldIncludeDiskStat("sda", devices)).toBe(true);
	});

	it("keeps a partition-looking row if its parent disk is absent (defensive)", () => {
		expect(shouldIncludeDiskStat("sda1", ["sda1"])).toBe(true);
	});
});
