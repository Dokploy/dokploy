import { isPhysicalDisk } from "@dokploy/server/monitoring/utils";
import { describe, expect, it } from "vitest";

describe("isPhysicalDisk (#5513, #5385)", () => {
	it.each([
		"sda",
		"sdab",
		"hda",
		"vda",
		"xvda",
		"nvme0n1",
		"nvme1n1",
		"mmcblk0",
	])("counts whole disk %s", (device) => {
		expect(isPhysicalDisk(device)).toBe(true);
	});

	it.each([
		"sda1",
		"sdab12",
		"hda1",
		"vda1",
		"xvda1",
		"nvme0n1p1",
		"nvme1n1p4",
		"mmcblk0p1",
	])("skips partition %s", (device) => {
		expect(isPhysicalDisk(device)).toBe(false);
	});

	it.each(["md0", "md127", "dm-0", "dm-12"])(
		"skips stacked device %s",
		(device) => {
			expect(isPhysicalDisk(device)).toBe(false);
		},
	);

	it.each(["loop0", "ram0", "zram0", "sr0", "fd0"])(
		"skips virtual device %s",
		(device) => {
			expect(isPhysicalDisk(device)).toBe(false);
		},
	);

	it("counts each write once on an mdadm RAID1 host", () => {
		const devices = [
			"nvme0n1",
			"nvme0n1p1",
			"nvme0n1p2",
			"nvme0n1p3",
			"nvme0n1p4",
			"nvme1n1",
			"nvme1n1p1",
			"nvme1n1p2",
			"nvme1n1p3",
			"nvme1n1p4",
			"md0",
			"md1",
			"md2",
			"md3",
		];
		expect(devices.filter(isPhysicalDisk)).toEqual(["nvme0n1", "nvme1n1"]);
	});
});
