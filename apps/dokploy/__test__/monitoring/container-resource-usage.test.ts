import { parseDockerTopProcesses } from "@dokploy/server/services/docker";
import { describe, expect, test } from "vitest";
import {
	type ContainerResourceStat,
	getContainerResourceValues,
	parseDockerSize,
	sortContainerStats,
} from "@/components/dashboard/monitoring/container-resource-usage/utils";

const stats: ContainerResourceStat[] = [
	{
		BlockIO: "1.2MB / 300kB",
		CPUPerc: "8.50%",
		Container: "api",
		ID: "a1",
		MemPerc: "20.00%",
		MemUsage: "512MiB / 2GiB",
		Name: "api",
		NetIO: "2MB / 1MB",
		Size: "1.2MB (virtual 120MB)",
	},
	{
		BlockIO: "20MB / 12MB",
		CPUPerc: "1.20%",
		Container: "worker",
		ID: "b2",
		MemPerc: "40.00%",
		MemUsage: "1.5GiB / 4GiB",
		Name: "worker",
		NetIO: "4MB / 8MB",
		Size: "512kB (virtual 80MB)",
	},
	{
		BlockIO: "500kB / 200kB",
		CPUPerc: "65.30%",
		Container: "db",
		ID: "c3",
		MemPerc: "10.00%",
		MemUsage: "256MiB / 8GiB",
		Name: "db",
		NetIO: "1MB / 900kB",
		Size: "2.5GB (virtual 4GB)",
	},
];

describe("container resource usage utils", () => {
	test("parses Docker size units into bytes for sorting", () => {
		expect(parseDockerSize("1KiB")).toBe(1024);
		expect(parseDockerSize("1MiB")).toBe(1024 ** 2);
		expect(parseDockerSize("1.5GiB")).toBe(1.5 * 1024 ** 3);
		expect(parseDockerSize("20MB")).toBe(20 * 1000 ** 2);
		expect(parseDockerSize("300kB")).toBe(300 * 1000);
		expect(parseDockerSize("0B")).toBe(0);
		expect(parseDockerSize("--")).toBe(0);
	});

	test("extracts comparable numeric values from docker stats output", () => {
		const workerStat = stats[1];
		expect(workerStat).toBeDefined();

		const values = getContainerResourceValues(workerStat!);

		expect(values.cpuPercent).toBe(1.2);
		expect(values.memoryUsedBytes).toBe(1.5 * 1024 ** 3);
		expect(values.memoryLimitBytes).toBe(4 * 1024 ** 3);
		expect(values.blockTotalBytes).toBe(32 * 1000 ** 2);
		expect(values.networkTotalBytes).toBe(12 * 1000 ** 2);
		expect(values.diskSizeBytes).toBe(512 * 1000);
		expect(values.virtualSizeBytes).toBe(80 * 1000 ** 2);
	});

	test("sorts containers by the selected resource pressure", () => {
		expect(sortContainerStats(stats, "cpu").map((stat) => stat.Name)).toEqual([
			"db",
			"api",
			"worker",
		]);

		expect(
			sortContainerStats(stats, "memory").map((stat) => stat.Name),
		).toEqual(["worker", "api", "db"]);

		expect(sortContainerStats(stats, "block").map((stat) => stat.Name)).toEqual(
			["worker", "api", "db"],
		);

		expect(sortContainerStats(stats, "size").map((stat) => stat.Name)).toEqual([
			"db",
			"api",
			"worker",
		]);
	});
});

describe("parseDockerTopProcesses", () => {
	test("parses docker top output and sorts processes by CPU then memory", () => {
		const output = [
			"PID %CPU %MEM RSS COMMAND",
			"101 0.4 1.2 20480 nginx: worker process",
			"102 18.5 0.7 10240 node /app/server.js --port 3000",
			"103 18.5 3.1 40960 postgres: checkpointer",
		].join("\n");

		const processes = parseDockerTopProcesses(output);

		expect(processes).toEqual([
			{
				command: "postgres: checkpointer",
				cpuPercent: 18.5,
				memoryPercent: 3.1,
				pid: "103",
				rssBytes: 40960 * 1024,
			},
			{
				command: "node /app/server.js --port 3000",
				cpuPercent: 18.5,
				memoryPercent: 0.7,
				pid: "102",
				rssBytes: 10240 * 1024,
			},
			{
				command: "nginx: worker process",
				cpuPercent: 0.4,
				memoryPercent: 1.2,
				pid: "101",
				rssBytes: 20480 * 1024,
			},
		]);
	});
});
