import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLastLogEntries } from "@dokploy/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const makeEntry = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({
		ClientAddr: "172.19.0.1:56732",
		DownstreamStatus: 200,
		RequestHost: "app.traefik.me",
		RequestMethod: "GET",
		RequestPath: "/",
		ServiceName: "my-app-web@docker",
		StartUTC: "2024-08-25T04:34:37.306691884Z",
		time: "2024-08-25T04:34:37Z",
		...overrides,
	});

const pathsOf = (result: string) =>
	result
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line).RequestPath as string);

describe("readLastLogEntries", () => {
	let directory: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "dokploy-access-log-"));
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	const writeLog = async (lines: string[], trailingNewline = true) => {
		const filePath = join(directory, "access.log");
		const suffix = trailingNewline && lines.length > 0 ? "\n" : "";
		await writeFile(filePath, `${lines.join("\n")}${suffix}`);
		return filePath;
	};

	it("returns the newest entries instead of the oldest ones", async () => {
		const filePath = await writeLog(
			Array.from({ length: 10 }, (_, index) =>
				makeEntry({
					RequestPath: `/page-${index}`,
					StartUTC: `2024-08-25T0${index}:00:00Z`,
				}),
			),
		);

		const result = await readLastLogEntries(filePath, { limit: 3 });

		expect(pathsOf(result)).toEqual(["/page-7", "/page-8", "/page-9"]);
	});

	it("returns every entry when the limit exceeds the file", async () => {
		const filePath = await writeLog([
			makeEntry({ RequestPath: "/first" }),
			makeEntry({ RequestPath: "/second" }),
		]);

		const result = await readLastLogEntries(filePath, { limit: 500 });

		expect(pathsOf(result)).toEqual(["/first", "/second"]);
	});

	it("handles entries that span chunk boundaries", async () => {
		// The reader walks the file in 64 KiB chunks; ~4 KiB per entry over 40 entries
		// forces several chunks and leaves entries straddling the boundaries.
		const padding = "x".repeat(4096);
		const filePath = await writeLog(
			Array.from({ length: 40 }, (_, index) =>
				makeEntry({
					RequestPath: `/page-${index}`,
					request_User_Agent: padding,
				}),
			),
		);

		const paths = pathsOf(await readLastLogEntries(filePath, { limit: 40 }));

		expect(paths).toHaveLength(40);
		expect(paths[0]).toBe("/page-0");
		expect(paths[39]).toBe("/page-39");
	});

	it("stops at the first entry older than notBefore", async () => {
		const filePath = await writeLog([
			makeEntry({ RequestPath: "/older", StartUTC: "2024-08-25T01:00:00Z" }),
			makeEntry({ RequestPath: "/cutoff", StartUTC: "2024-08-25T02:00:00Z" }),
			makeEntry({ RequestPath: "/newer", StartUTC: "2024-08-25T03:00:00Z" }),
		]);

		const result = await readLastLogEntries(filePath, {
			notBefore: new Date("2024-08-25T02:00:00Z"),
		});

		expect(pathsOf(result)).toEqual(["/cutoff", "/newer"]);
	});

	it("reads the last entry when the file has no trailing newline", async () => {
		const filePath = await writeLog(
			[makeEntry({ RequestPath: "/only" })],
			false,
		);

		expect(pathsOf(await readLastLogEntries(filePath))).toEqual(["/only"]);
	});

	it("skips malformed lines", async () => {
		const filePath = await writeLog([
			"not json at all",
			"{ truncated",
			makeEntry({ RequestPath: "/valid" }),
			"",
		]);

		expect(pathsOf(await readLastLogEntries(filePath))).toEqual(["/valid"]);
	});

	it("filters out Dokploy dashboard requests", async () => {
		const filePath = await writeLog([
			makeEntry({ RequestPath: "/app" }),
			makeEntry({
				RequestPath: "/dashboard",
				ServiceName: "dokploy-service-app@file",
			}),
		]);

		expect(pathsOf(await readLastLogEntries(filePath))).toEqual(["/app"]);
	});

	it("does not count filtered entries against the limit", async () => {
		const filePath = await writeLog([
			makeEntry({ RequestPath: "/kept" }),
			makeEntry({ ServiceName: "dokploy-service-app@file" }),
			makeEntry({ ServiceName: "dokploy-service-app@file" }),
		]);

		expect(pathsOf(await readLastLogEntries(filePath, { limit: 1 }))).toEqual([
			"/kept",
		]);
	});

	it("returns an empty string for an empty file", async () => {
		const filePath = await writeLog([]);

		expect(await readLastLogEntries(filePath)).toBe("");
	});

	it("returns an empty string when the limit is not positive", async () => {
		const filePath = await writeLog([makeEntry()]);

		expect(await readLastLogEntries(filePath, { limit: 0 })).toBe("");
	});
});
