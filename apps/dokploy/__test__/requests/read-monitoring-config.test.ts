import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMonitoringConfig } from "@dokploy/server/utils/traefik/application";
import { afterAll, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "access-log-"));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: () => ({ ...actual.paths(), DYNAMIC_TRAEFIK_PATH: dir }),
	};
});

const BASE = Date.parse("2026-10-01T00:00:00Z");

const entry = (i: number, extra: Record<string, unknown> = {}) => {
	const start = new Date(BASE + i * 1000 + 500);
	return JSON.stringify({
		RequestPath: `/req-${i}`,
		ServiceName: "app-web@docker",
		StartUTC: start.toISOString(),
		time: `${start.toISOString().slice(0, 19)}Z`,
		...extra,
	});
};

const writeLog = (lines: string[], trailingNewline = true) =>
	fs.writeFileSync(
		path.join(dir, "access.log"),
		lines.join("\n") + (trailingNewline ? "\n" : ""),
	);

const read = async (dateRange?: { start?: string; end?: string }) => {
	const raw = (await readMonitoringConfig(dateRange)) as string;
	return raw
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line).RequestPath as string);
};

describe("readMonitoringConfig", () => {
	afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

	it("returns the newest 500 entries, skipping dashboard and malformed lines", async () => {
		const lines: string[] = [];
		for (let i = 0; i < 600; i++) {
			lines.push(entry(i));
			lines.push(entry(i, { ServiceName: "dokploy-service-app@file" }));
			lines.push("{broken");
		}
		writeLog(lines);

		const paths = await read();
		expect(paths).toHaveLength(500);
		expect(paths[0]).toBe("/req-100");
		expect(paths[499]).toBe("/req-599");
	});

	it("keeps multi-byte characters intact across chunk boundaries", async () => {
		const agent = "ñ🚀".repeat(1000);
		writeLog(
			Array.from({ length: 100 }, (_, i) => entry(i, { agent })),
			false,
		);

		const raw = (await readMonitoringConfig()) as string;
		const logs = raw
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		expect(logs).toHaveLength(100);
		expect(logs[0].RequestPath).toBe("/req-0");
		expect(logs.every((log) => log.agent === agent)).toBe(true);
	});

	it("reads back to the start date only", async () => {
		writeLog(Array.from({ length: 2000 }, (_, i) => entry(i)));

		const paths = await read({
			start: new Date(BASE + 1200 * 1000 + 100).toISOString(),
		});
		expect(paths).toHaveLength(800);
		expect(paths[0]).toBe("/req-1200");
		expect(paths[799]).toBe("/req-1999");
	});

	it("keeps in-range requests logged after a slower, older one", async () => {
		writeLog([
			entry(0),
			entry(10),
			entry(5, { time: "2026-10-01T00:00:12Z" }),
			entry(11),
		]);

		const paths = await read({
			start: new Date(BASE + 10 * 1000).toISOString(),
		});
		expect(paths).toEqual(["/req-10", "/req-5", "/req-11"]);
	});

	it("reads the whole file when only an end date is given", async () => {
		writeLog(Array.from({ length: 2000 }, (_, i) => entry(i)));

		const paths = await read({
			end: new Date(BASE + 100 * 1000).toISOString(),
		});
		expect(paths).toHaveLength(2000);
	});

	it("returns null when the log does not exist", async () => {
		fs.rmSync(path.join(dir, "access.log"));
		expect(await readMonitoringConfig()).toBeNull();
	});
});
