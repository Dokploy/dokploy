import { promises } from "node:fs";
import {
	type Container,
	getLastAdvancedStatsFile,
	paths,
	recordAdvancedStats,
} from "@dokploy/server";
import { afterEach, describe, expect, it } from "vitest";

const sample: Container = {
	BlockIO: "610kB / 938169.55MB",
	CPUPerc: "1.25%",
	Container: "container-1",
	ID: "container-1",
	MemPerc: "18.75%",
	MemUsage: "12MiB / 64MiB",
	Name: "app",
	NetIO: "1.5MB / 2kB",
};

const createdApps: string[] = [];

const uniqueAppName = () => {
	const appName = `test-stats-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	createdApps.push(appName);
	return appName;
};

afterEach(async () => {
	const { MONITORING_PATH } = paths();
	await Promise.all(
		createdApps.splice(0).map((appName) =>
			promises.rm(`${MONITORING_PATH}/${appName}`, {
				recursive: true,
				force: true,
			}),
		),
	);
});

describe("recordAdvancedStats", () => {
	it("returns exactly what reading the files back would produce", async () => {
		// The websocket used to write these files and then read all of them back
		// to build its payload. It now uses this return value instead, so the two
		// must serialise identically - `time` is a Date here and a string after
		// the JSON round-trip, and both must reach the client the same way.
		const appName = uniqueAppName();

		const returned = await recordAdvancedStats(sample, appName);
		const readBack = await getLastAdvancedStatsFile(appName);

		expect(JSON.stringify({ data: returned })).toBe(
			JSON.stringify({ data: readBack }),
		);
	});

	it("persists the samples it returns", async () => {
		const appName = uniqueAppName();

		const returned = await recordAdvancedStats(sample, appName);

		expect(returned.cpu.value).toBe("1.25%");
		expect(returned.memory.value).toEqual({ used: "12MiB", total: "64MiB" });
		// disk is only collected for the dokploy host itself
		expect(returned.disk).toBeNull();

		const { MONITORING_PATH } = paths();
		const cpu = JSON.parse(
			await promises.readFile(
				`${MONITORING_PATH}/${appName}/cpu.json`,
				"utf-8",
			),
		);
		expect(cpu.at(-1).value).toBe("1.25%");
	});
});
