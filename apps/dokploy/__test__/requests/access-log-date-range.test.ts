import fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	aggregateHourlyRequests,
	DATE_RANGE_ENTRY_LIMIT,
	parseRawConfig,
	processLogs,
	readMonitoringConfig,
	readMonitoringStats,
} from "@dokploy/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for DOKPLOY-COMMUNITY-4H: the Requests page called
 * readFileSync on the whole access.log whenever a date range was selected, which
 * throws ERR_STRING_TOO_LONG once the file passes ~512 MB. These tests pin down that
 * the streaming implementation returns exactly what the old whole-file read did.
 */

const DASHBOARD = "dokploy-service-app@file";

type Entry = Record<string, unknown>;

const entry = (index: number, overrides: Entry = {}): Entry => {
	// 5 days of traffic, one request every 2 minutes plus a few that share a second
	// so ordering ties are exercised.
	const base = Date.UTC(2026, 8, 1, 0, 0, 0) + index * 2 * 60 * 1000;
	const iso = new Date(base).toISOString();
	return {
		ClientAddr: "172.19.0.1:56732",
		DownstreamStatus: index % 7 === 0 ? 500 : index % 5 === 0 ? 404 : 200,
		RequestHost: index % 2 === 0 ? "app.example.com" : "api.example.com",
		RequestMethod: "GET",
		RequestPath: `/req-${String(index).padStart(5, "0")}`,
		ServiceName: index % 11 === 0 ? DASHBOARD : "my-app-web@docker",
		StartUTC: iso.replace("Z", ".123456789Z"),
		// Traefik logs `time` with second resolution, so many entries tie.
		time: `${iso.slice(0, 16)}:00Z`,
		padding: "x".repeat(300),
		...overrides,
	};
};

const ENTRY_COUNT = 3600; // 5 days at one entry per 2 minutes
const rangeOf = (startHours: number, endHours: number) => ({
	start: new Date(Date.UTC(2026, 8, 1) + startHours * 3600_000).toISOString(),
	end: new Date(Date.UTC(2026, 8, 1) + endHours * 3600_000).toISOString(),
});

describe("access.log date range reads", () => {
	let directory: string;
	let fullFile: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "dokploy-access-range-"));
		await mkdir(join(directory, ".docker", "traefik", "dynamic"), {
			recursive: true,
		});

		const lines: string[] = [];
		for (let i = 0; i < ENTRY_COUNT; i++) {
			lines.push(JSON.stringify(entry(i)));
			if (i === 1000) {
				lines.push("not json at all");
				lines.push("{ truncated");
				// A slow request: started well before the range below, but logged (time)
				// after faster ones, so the file is not ordered by StartUTC.
				lines.push(
					JSON.stringify(
						entry(1000, {
							RequestPath: "/slow",
							StartUTC: "2026-09-02T09:00:00.000000000Z",
							time: "2026-09-02T09:21:00Z",
						}),
					),
				);
			}
		}
		fullFile = `${lines.join("\n")}\n`;
		await writeFile(
			join(directory, ".docker", "traefik", "dynamic", "access.log"),
			fullFile,
		);
		vi.spyOn(process, "cwd").mockReturnValue(directory);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(directory, { recursive: true, force: true });
	});

	const accessLogPath = () =>
		join(directory, ".docker", "traefik", "dynamic", "access.log");

	const ranges = [
		["a middle day", rangeOf(30, 54)],
		["the last six hours", rangeOf(114, 130)],
		["a range wider than the file", rangeOf(-100, 1000)],
		["an empty range in the future", rangeOf(2000, 2010)],
		["a range starting just after the slow request began", rangeOf(33.1, 36)],
	] as const;

	for (const [label, range] of ranges) {
		it(`readStatsLogs data matches the whole-file read for ${label}`, async () => {
			const raw = await readMonitoringConfig(true, range);

			for (const sort of [
				undefined,
				{ id: "DownstreamStatus", desc: false },
				{ id: "StartUTC", desc: true },
			]) {
				const expected = parseRawConfig(
					fullFile,
					undefined,
					sort,
					undefined,
					undefined,
					range,
				);
				const actual = parseRawConfig(
					raw as string,
					undefined,
					sort,
					undefined,
					undefined,
					range,
				);

				expect(actual.totalCount).toBe(expected.totalCount);
				expect(actual.data).toEqual(expected.data);
			}
		});

		it(`readStatsLogs pagination and filters match for ${label}`, async () => {
			const raw = await readMonitoringConfig(true, range);
			const args = [
				{ pageIndex: 1, pageSize: 10 },
				{ id: "time", desc: true },
				"api.example.com",
				["2xx"],
				range,
			] as const;

			expect(parseRawConfig(raw as string, ...args)).toEqual(
				parseRawConfig(fullFile, ...args),
			);
		});

		it(`readStats hourly counts match processLogs on the whole file for ${label}`, async () => {
			const expected = processLogs(fullFile, range);

			expect(await readMonitoringStats(range)).toEqual(expected);
			expect(await aggregateHourlyRequests(accessLogPath(), range)).toEqual(
				expected,
			);
		});
	}

	it("keeps the in-range slow request that was logged after faster ones", async () => {
		// The slow request started at 09:00 (before the range) but was logged at 09:21
		// (inside it), so the reader must not treat it as the cutoff boundary.
		const range = rangeOf(33.1, 36);
		const raw = (await readMonitoringConfig(true, range)) as string;

		expect(raw).toContain('"RequestPath":"/slow"');
	});

	it("handles a start-only and an end-only range for readStats", async () => {
		const startOnly = { start: rangeOf(60, 0).start };
		const endOnly = { end: rangeOf(0, 60).end };

		expect(await readMonitoringStats(startOnly)).toEqual(
			processLogs(fullFile, startOnly),
		);
		expect(await readMonitoringStats(endOnly)).toEqual(
			processLogs(fullFile, endOnly),
		);
	});

	it("never reads the whole access.log into a string when a range is given", async () => {
		const readFileSync = vi.spyOn(fs, "readFileSync");
		const range = rangeOf(30, 54);

		await readMonitoringConfig(true, range);
		await readMonitoringStats(range);
		await readMonitoringStats({ end: range.end });

		const wholeFileReads = readFileSync.mock.calls.filter(([target]) =>
			String(target).endsWith("access.log"),
		);
		expect(wholeFileReads).toEqual([]);
	});

	it("returns the newest entries, not the oldest, without a range", async () => {
		const raw = (await readMonitoringConfig(false)) as string;
		const paths = raw
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line).RequestPath as string);

		expect(paths).toHaveLength(500);
		expect(paths[paths.length - 1]).toBe(
			`/req-${String(ENTRY_COUNT - 1).padStart(5, "0")}`,
		);
	});

	it("does not truncate hourly stats at the readStatsLogs entry cap", async () => {
		// readStatsLogs needs individual entries so it is capped; the chart only needs
		// per-hour counts, so a range holding more entries than the cap must still be
		// counted completely. Shrink the effective cap by writing more entries than it.
		const extra = DATE_RANGE_ENTRY_LIMIT + 1000;
		const base = Date.UTC(2026, 9, 1, 0, 0, 0);
		const lines: string[] = [];
		for (let i = 0; i < extra; i++) {
			const iso = new Date(base + (i % 3600) * 1000).toISOString();
			lines.push(
				JSON.stringify({
					ServiceName: "my-app-web@docker",
					StartUTC: iso,
					time: iso.slice(0, 19).concat("Z"),
				}),
			);
		}
		await writeFile(accessLogPath(), `${lines.join("\n")}\n`);

		const range = {
			start: new Date(base).toISOString(),
			end: new Date(base + 2 * 3600_000).toISOString(),
		};
		const stats = await readMonitoringStats(range);
		const total = stats.reduce((sum, bucket) => sum + bucket.count, 0);

		expect(total).toBe(extra);
		expect(
			((await readMonitoringConfig(true, range)) as string).split("\n"),
		).toHaveLength(DATE_RANGE_ENTRY_LIMIT);
	});

	it("returns nothing when access.log does not exist", async () => {
		await rm(accessLogPath());

		expect(await readMonitoringConfig(true, rangeOf(0, 10))).toBeNull();
		expect(await readMonitoringStats(rangeOf(0, 10))).toEqual([]);
	});
});
