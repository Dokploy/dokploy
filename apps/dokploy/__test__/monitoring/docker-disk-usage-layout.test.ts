import { describe, expect, test } from "vitest";
import {
	getDockerDiskUsageCardClassName,
	getDockerDiskUsageChartClassName,
	getDockerDiskUsageControlsClassName,
	getDockerDiskUsageLegendClassName,
	getDockerDiskUsageLegendTextClassName,
	getDockerDiskUsageSelectTriggerClassName,
	getDockerDiskUsageToggleClassName,
} from "@/components/dashboard/monitoring/free/container/docker-disk-usage-layout";

describe("Docker Disk Usage layout", () => {
	test("spans the two-column monitoring grid only while details are expanded", () => {
		expect(getDockerDiskUsageCardClassName(true).split(" ")).toEqual(
			expect.arrayContaining(["bg-background", "lg:col-span-2"]),
		);

		const collapsedClasses = getDockerDiskUsageCardClassName(false).split(" ");

		expect(collapsedClasses).toContain("bg-background");
		expect(collapsedClasses).not.toContain("lg:col-span-2");
	});

	test("uses compact controls and legend classes while details are collapsed", () => {
		expect(getDockerDiskUsageControlsClassName(false).split(" ")).toEqual(
			expect.arrayContaining([
				"grid",
				"w-full",
				"grid-cols-[minmax(0,1fr)_auto]",
			]),
		);
		expect(getDockerDiskUsageSelectTriggerClassName(false).split(" ")).toEqual(
			expect.arrayContaining(["h-8", "w-full"]),
		);
		expect(getDockerDiskUsageToggleClassName(false).split(" ")).toEqual(
			expect.arrayContaining(["col-span-2", "w-full", "justify-center"]),
		);
		expect(getDockerDiskUsageChartClassName(false).split(" ")).toEqual(
			expect.arrayContaining(["h-[180px]", "max-h-[190px]"]),
		);
		expect(getDockerDiskUsageLegendClassName(false).split(" ")).toEqual(
			expect.arrayContaining(["grid", "grid-cols-2"]),
		);
		expect(getDockerDiskUsageLegendTextClassName(false).split(" ")).toContain(
			"break-words",
		);
		expect(
			getDockerDiskUsageLegendTextClassName(false).split(" "),
		).not.toContain("truncate");
	});

	test("reserves fixed chart and legend space while details are expanded", () => {
		expect(getDockerDiskUsageChartClassName(true).split(" ")).toEqual(
			expect.arrayContaining([
				"aspect-auto",
				"overflow-hidden",
				"h-[220px]",
				"max-h-[220px]",
			]),
		);
		expect(getDockerDiskUsageChartClassName(true).split(" ")).not.toContain(
			"aspect-video",
		);
		expect(getDockerDiskUsageLegendClassName(true).split(" ")).toEqual(
			expect.arrayContaining(["mb-4", "flex", "flex-wrap"]),
		);
	});
});
