import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Restoration } from "@dokploy/server/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	directory: "",
	rows: new Map<string, Record<string, unknown>>(),
}));
vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ BASE_PATH: state.directory }),
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: () => ({
			values: (row: Restoration) => ({
				// biome-ignore lint/suspicious/noThenProperty: Drizzle queries are intentionally awaitable in this mock.
				then: (resolve: (value: unknown) => void) => {
					state.rows.set(row.restorationId, { ...row });
					resolve(row);
				},
				onConflictDoUpdate: () => {
					state.rows.set(row.restorationId, { ...row });
					return Promise.resolve();
				},
				onConflictDoNothing: () => {
					if (!state.rows.has(row.restorationId))
						state.rows.set(row.restorationId, { ...row });
					return Promise.resolve();
				},
			}),
		}),
		update: () => ({
			set: (changes: Record<string, unknown>) => ({
				where: () => {
					for (const row of state.rows.values()) Object.assign(row, changes);
					return Promise.resolve();
				},
			}),
		}),
		delete: () => ({ where: () => Promise.resolve() }),
		query: {
			organization: { findFirst: () => Promise.resolve({ id: "org" }) },
		},
	},
}));

import {
	readRestorationLog,
	recoverRestorationHistory,
	restorationHistoryDirectory,
	restorationLogPath,
	startTrackedRestoration,
} from "@/server/utils/restoration-history";

const metadata = {
	organizationId: "org",
	kind: "volume" as const,
	serviceId: "service",
	serviceType: "compose",
	serviceName: "Example",
	serviceHref: null,
	targetName: "uploads",
	backupFile: "uploads.tar",
	destinationName: "S3",
};

beforeEach(async () => {
	state.directory = await mkdtemp(
		path.join(os.tmpdir(), "restoration-history-test-"),
	);
	state.rows.clear();
});
afterEach(async () => {
	await rm(state.directory, { recursive: true, force: true });
});

describe("Persistent restoration history", () => {
	it("keeps the final journal result when the restored database has older running status", async () => {
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async () => {},
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		state.rows.get(restorationId)!.status = "running";
		await recoverRestorationHistory();
		expect(state.rows.get(restorationId)?.status).toBe("done");
	});

	it("does not present a task imported from a backup as still running", async () => {
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async () => {},
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		const file = path.join(
			restorationHistoryDirectory(),
			`${restorationId}.json`,
		);
		const row = JSON.parse(await readFile(file, "utf8"));
		await writeFile(
			file,
			JSON.stringify({ ...row, status: "running", finishedAt: null }),
		);
		await recoverRestorationHistory();
		expect(state.rows.get(restorationId)?.status).toBe("error");
	});
	it("reattaches the failure record when a whole-instance restore fails", async () => {
		const recover = vi.fn(() => recoverRestorationHistory());
		const { restorationId } = await startTrackedRestoration(
			{
				...metadata,
				organizationId: null,
				kind: "dokploy",
				serviceId: "web-server",
			},
			async () => {
				state.rows.clear();
				throw new Error("Database restore failed");
			},
			[],
			recover,
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("error"),
		);
		expect(recover).toHaveBeenCalledOnce();
		expect((await readRestorationLog(restorationId)).text).toContain(
			"Database restore failed",
		);
	});

	it("ignores damaged history entries while keeping valid history readable", async () => {
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async () => {},
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		await writeFile(
			path.join(restorationHistoryDirectory(), "damaged.json"),
			"{invalid",
		);
		state.rows.clear();
		await recoverRestorationHistory();
		expect(state.rows.get(restorationId)?.status).toBe("done");
	});
	it("returns before completion and retains the result without a log subscriber", async () => {
		let finish!: () => void;
		const operation = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async (append) => {
				append("Downloading backup...\n");
				await operation;
				append("Extracted all files\n");
			},
		);
		expect(state.rows.get(restorationId)?.status).toBe("running");
		// No browser or subscription is connected while the operation completes.
		finish();
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		expect((await readRestorationLog(restorationId)).text).toContain(
			"Extracted all files",
		);
		expect(
			JSON.parse(
				await readFile(
					path.join(restorationHistoryDirectory(), `${restorationId}.json`),
					"utf8",
				),
			).status,
		).toBe("done");
	});

	it("records a failure and redacts credentials from logs, errors, and journals", async () => {
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async (append) => {
				append("database password=example-");
				append("password\n");
				throw new Error(
					'rclone --s3-access-key-id="example-key" --s3-secret-access-key="example-secret" failed: example-password',
				);
			},
			["example-password"],
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("error"),
		);
		const log = (await readRestorationLog(restorationId)).text;
		const journal = await readFile(
			path.join(restorationHistoryDirectory(), `${restorationId}.json`),
			"utf8",
		);
		for (const text of [log, journal]) {
			expect(text).not.toContain("example-password");
			expect(text).not.toContain("example-key");
			expect(text).not.toContain("example-secret");
		}
		expect(log).toContain("[REDACTED]");
	});

	it("rehydrates history after the Dokploy database was replaced", async () => {
		const { restorationId } = await startTrackedRestoration(
			{
				...metadata,
				organizationId: null,
				kind: "dokploy",
				serviceId: "web-server",
			},
			async (append) => {
				append("Database replaced\n");
				state.rows.clear();
			},
			[],
			() => recoverRestorationHistory(),
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		expect((await readRestorationLog(restorationId)).text).toContain(
			"Database replaced",
		);
		state.rows.clear();
		await recoverRestorationHistory();
		expect(state.rows.get(restorationId)?.status).toBe("done");
	});

	it("marks an unfinished operation as interrupted after a server restart", async () => {
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async () => {},
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		const file = path.join(
			restorationHistoryDirectory(),
			`${restorationId}.json`,
		);
		const row = JSON.parse(await readFile(file, "utf8"));
		await writeFile(
			file,
			JSON.stringify({ ...row, status: "running", finishedAt: null }),
		);
		state.rows.clear();
		await recoverRestorationHistory(true);
		expect(state.rows.get(restorationId)?.status).toBe("error");
		expect((await readRestorationLog(restorationId)).text).toContain(
			"Verify the restored data before retrying",
		);
	});

	it("bounds the displayed log while preserving the full file", async () => {
		const { restorationId } = await startTrackedRestoration(
			metadata,
			async (append) => {
				append(`${"line\n".repeat(40000)}Final extraction step\n`);
			},
		);
		await vi.waitFor(() =>
			expect(state.rows.get(restorationId)?.status).toBe("done"),
		);
		const log = await readRestorationLog(restorationId);
		expect(log.truncated).toBe(true);
		expect(log.text.length).toBeLessThanOrEqual(128 * 1024);
		expect(log.text).toContain("Final extraction step");
		expect(
			(await readFile(restorationLogPath(restorationId), "utf8")).length,
		).toBeGreaterThan(log.text.length);
	});

	it("rejects a log path outside the history directory", () => {
		expect(() => restorationLogPath("../private")).toThrow(
			"Invalid restoration ID",
		);
	});
});
