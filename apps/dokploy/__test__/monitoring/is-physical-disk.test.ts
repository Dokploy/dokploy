import {
	getHostSystemStats,
	isPhysicalDisk,
} from "@dokploy/server/monitoring/utils";
import { describe, expect, it, vi } from "vitest";

const GiB = 1024 ** 3;
const diskStat = (device: string, readGiB: number, writeGiB: number) => ({
	device,
	readBytes: { toBytes: () => readGiB * GiB },
	writeBytes: { toBytes: () => writeGiB * GiB },
});

vi.mock("node-os-utils", () => ({
	OSUtils: class {
		cpu = { usage: async () => ({ success: false }) };
		memory = {
			info: async () => ({ success: false }),
			swap: async () => ({ success: false }),
		};
		network = { overview: async () => ({ success: false }) };
		disk = {
			stats: async () => ({
				success: true,
				data: [
					diskStat("nvme0n1", 50, 100),
					diskStat("nvme0n1p1", 50, 100),
					diskStat("nvme1n1", 50, 100),
					diskStat("nvme1n1p1", 50, 100),
					diskStat("md0", 50, 100),
					diskStat("md0p1", 50, 100),
					diskStat("dm-0", 50, 100),
					diskStat("zram0", 10, 20),
				],
			}),
		};
	},
}));

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

	it.each(["md0", "md127", "md0p1", "md_d0p1", "dm-0", "dm-12"])(
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

describe("getHostSystemStats Block I/O (#5513, #5385)", () => {
	it("sums only whole physical disks", async () => {
		const stats = await getHostSystemStats();
		expect(stats.BlockIO).toBe("100.00GiB / 200.00GiB");
	});
});
