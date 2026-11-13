import { combineContainerStats } from "@dokploy/server/monitoring/combine-stats";
import type { Container } from "@dokploy/server/monitoring/utils";
import { describe, expect, it } from "vitest";

const GiB = 1024 ** 3;

const replica = (overrides: Partial<Container>): Container => ({
	BlockIO: "0B / 0B",
	CPUPerc: "0.00%",
	Container: "abc",
	ID: "abc",
	MemPerc: "0.00%",
	MemUsage: "0B / 8GiB",
	Name: "app.1.abc",
	NetIO: "0B / 0B",
	...overrides,
});

describe("combineContainerStats", () => {
	it("returns undefined without containers", () => {
		expect(combineContainerStats([], 8 * GiB)).toBeUndefined();
	});

	it("keeps a single container unchanged", () => {
		const only = replica({ CPUPerc: "12.34%", MemUsage: "10.5MiB / 8GiB" });
		expect(combineContainerStats([only], 8 * GiB)).toBe(only);
	});

	it("sums CPU, memory and I/O over all replicas", () => {
		const combined = combineContainerStats(
			[
				replica({
					ID: "a",
					Name: "app.1.a",
					CPUPerc: "10.50%",
					MemUsage: "100MiB / 512MiB",
					NetIO: "1.5kB / 2MB",
					BlockIO: "1MB / 0B",
				}),
				replica({
					ID: "b",
					Name: "app.2.b",
					CPUPerc: "4.25%",
					MemUsage: "400MiB / 512MiB",
					NetIO: "500B / 1GB",
					BlockIO: "2MB / 3MB",
				}),
			],
			8 * GiB,
		);

		expect(combined).toMatchObject({
			CPUPerc: "14.75%",
			MemUsage: "500.00MiB / 1024.00MiB",
			MemPerc: "48.83%",
			NetIO: "0.002000MB / 1002.000000MB",
			BlockIO: "3.000000MB / 3.000000MB",
			ID: "a,b",
			Name: "app.1.a,app.2.b",
		});
	});

	it("caps the memory limit at the host memory for unlimited replicas", () => {
		const combined = combineContainerStats(
			[
				replica({ MemUsage: "1GiB / 8GiB" }),
				replica({ MemUsage: "1GiB / 8GiB" }),
			],
			8 * GiB,
		);

		expect(combined?.MemUsage).toBe("2048.00MiB / 8192.00MiB");
		expect(combined?.MemPerc).toBe("25.00%");
	});
});
