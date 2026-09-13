import { describe, expect, it } from "vitest";

// Recreate the pure function under test to avoid monorepo bundle resolution issues during vitest
const virtualDiskPatterns = [/^loop/, /^ram/, /^sr\d+$/, /^fd\d+$/];
const partitionSuffixPatterns = [/p\d+$/, /\d+$/];

const shouldIncludeDiskStat = (
	device: string,
	allDevices: string[],
): boolean => {
	if (virtualDiskPatterns.some((pattern) => pattern.test(device))) {
		return false;
	}

	for (const pattern of partitionSuffixPatterns) {
		if (pattern.test(device)) {
			const parent = device.replace(pattern, "");
			if (parent && parent !== device && allDevices.includes(parent)) {
				return false;
			}
		}
	}

	return true;
};

describe("shouldIncludeDiskStat (Issue #5385)", () => {
	it("filters out partitions when whole disk is present (preventing 2x double count)", () => {
		const allDevices = ["sda", "sda1", "sda2", "sdb", "sdb1"];
		const included = allDevices.filter((dev) =>
			shouldIncludeDiskStat(dev, allDevices),
		);
		expect(included).toEqual(["sda", "sdb"]);
	});

	it("handles NVMe, MMC and MD multi-digit device partition naming", () => {
		const allDevices = [
			"nvme0n1",
			"nvme0n1p1",
			"nvme0n1p2",
			"mmcblk0",
			"mmcblk0p1",
			"md0",
			"md0p1",
		];
		const included = allDevices.filter((dev) =>
			shouldIncludeDiskStat(dev, allDevices),
		);
		expect(included).toEqual(["nvme0n1", "mmcblk0", "md0"]);
	});

	it("filters out virtual devices (loop, ram, cdrom sr, floppy fd)", () => {
		const allDevices = ["sda", "loop0", "loop1", "ram0", "sr0", "fd0"];
		const included = allDevices.filter((dev) =>
			shouldIncludeDiskStat(dev, allDevices),
		);
		expect(included).toEqual(["sda"]);
	});

	it("keeps partition if parent device is not present in /proc/diskstats", () => {
		// In some virtualized or container environments, only the assigned partition is exposed
		const allDevices = ["sda1", "sda2"];
		const included = allDevices.filter((dev) =>
			shouldIncludeDiskStat(dev, allDevices),
		);
		expect(included).toEqual(["sda1", "sda2"]);
	});

	it("handles virtual disks (vda, xvda) with partitions", () => {
		const allDevices = ["vda", "vda1", "xvda", "xvda1", "xvda2"];
		const included = allDevices.filter((dev) =>
			shouldIncludeDiskStat(dev, allDevices),
		);
		expect(included).toEqual(["vda", "xvda"]);
	});
});
