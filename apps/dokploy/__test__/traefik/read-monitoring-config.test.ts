import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMonitoringConfig } from "@dokploy/server/utils/traefik/application";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "access-log-"));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: () => ({ ...actual.paths(), DYNAMIC_TRAEFIK_PATH: dir }),
	};
});

describe("readMonitoringConfig", () => {
	beforeAll(() => {
		const lines = [];
		for (let i = 0; i < 600; i++) {
			lines.push(JSON.stringify({ n: i, ServiceName: "app@docker" }));
		}
		lines.push(
			JSON.stringify({ n: 600, ServiceName: "dokploy-service-app@file" }),
		);
		fs.writeFileSync(path.join(dir, "access.log"), `${lines.join("\n")}\n`);
	});
	afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

	it("returns the 500 most recent valid entries", async () => {
		const out = (await readMonitoringConfig()) as string;
		const logs = out
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logs).toHaveLength(500);
		expect(logs[0].n).toBe(100);
		expect(logs[499].n).toBe(599);
	});
});

// The tail-read walks the file backward in fixed-size chunks (see
// readRecentValidLines), so these pin the cases a forward scan can't get
// wrong but a backward, chunked one can: a line spanning a chunk boundary, no
// trailing newline, a file smaller than the limit, and junk lines mixed in.
describe("readMonitoringConfig tail reading", () => {
	beforeAll(() => fs.mkdirSync(dir, { recursive: true }));
	afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

	const write = (content: string) =>
		fs.writeFileSync(path.join(dir, "access.log"), content);

	it("returns every entry, oldest to newest, when the file has fewer than the limit", async () => {
		const lines = Array.from({ length: 7 }, (_, i) =>
			JSON.stringify({ n: i, ServiceName: "app@docker" }),
		);
		write(`${lines.join("\n")}\n`);

		const out = (await readMonitoringConfig()) as string;
		const logs = out
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logs.map((l) => l.n)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it("keeps the last entry intact when the file has no trailing newline", async () => {
		const lines = Array.from({ length: 5 }, (_, i) =>
			JSON.stringify({ n: i, ServiceName: "app@docker" }),
		);
		write(lines.join("\n")); // no trailing \n

		const out = (await readMonitoringConfig()) as string;
		const logs = out
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logs.map((l) => l.n)).toEqual([0, 1, 2, 3, 4]);
	});

	it("skips invalid JSON and non-JSON lines without miscounting the limit", async () => {
		const lines: string[] = [];
		for (let i = 0; i < 10; i++) {
			lines.push(JSON.stringify({ n: i, ServiceName: "app@docker" }));
			lines.push("not json");
			lines.push("{broken");
		}
		write(`${lines.join("\n")}\n`);

		const out = (await readMonitoringConfig()) as string;
		const logs = out
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logs.map((l) => l.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it("reconstructs a line that straddles a chunk boundary", async () => {
		// Lines big enough, and many enough, to push several real lines across
		// the reader's internal chunk boundaries however they happen to fall,
		// including one line's content containing a large contiguous run that
		// would corrupt silently if a chunk split landed inside it.
		const pad = "x".repeat(5000);
		const lines: string[] = [];
		for (let i = 0; i < 60; i++) {
			lines.push(JSON.stringify({ n: i, pad, ServiceName: "app@docker" }));
		}
		write(`${lines.join("\n")}\n`);

		const out = (await readMonitoringConfig()) as string;
		const logs = out
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logs).toHaveLength(60);
		expect(logs.map((l) => l.n)).toEqual(
			Array.from({ length: 60 }, (_, i) => i),
		);
		expect(logs.every((l) => l.pad === pad)).toBe(true);
	});

	it("returns an empty string for an empty file", async () => {
		write("");
		const out = (await readMonitoringConfig()) as string;
		expect(out).toBe("");
	});
});
