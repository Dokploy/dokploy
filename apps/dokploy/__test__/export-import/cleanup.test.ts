import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createExportJob,
	createImportJob,
	sweepOrphanedTransferDirectories,
	sweepRemoteTransferDirectories,
} from "@dokploy/server/services/project-export-import";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return { ...actual, execAsyncRemote: vi.fn() };
});

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "transfer-cleanup-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const fakePaths = () => ({ PROJECT_EXPORT_IMPORT_PATH: root }) as any;

const makeStaleDir = async (name: string) => {
	const dir = join(root, name);
	await mkdir(dir, { recursive: true });
	const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
	await utimes(dir, staleTime, staleTime);
	return dir;
};

describe("sweepOrphanedTransferDirectories", () => {
	it("deletes a stale directory with no matching job record (a genuine crash-orphan)", async () => {
		const dir = await makeStaleDir("orphaned-export-1");

		await sweepOrphanedTransferDirectories(fakePaths);

		expect(existsSync(dir)).toBe(false);
	});

	it("leaves a fresh directory alone regardless of job state", async () => {
		const dir = join(root, "fresh-export-1");
		await mkdir(dir, { recursive: true });

		await sweepOrphanedTransferDirectories(fakePaths);

		expect(existsSync(dir)).toBe(true);
	});

	it("does not delete a stale-by-mtime directory that still has a live export job record", async () => {
		const exportId = "export-still-running-1";
		createExportJob(exportId, "user-1", "org-1");
		const dir = await makeStaleDir(exportId);

		await sweepOrphanedTransferDirectories(fakePaths);

		expect(existsSync(dir)).toBe(true);
	});

	it("does not delete a stale-by-mtime directory that still has a live import job record", async () => {
		const importId = "import-still-running-1";
		createImportJob(importId, "user-1", "org-1");
		const dir = await makeStaleDir(importId);

		await sweepOrphanedTransferDirectories(fakePaths);

		expect(existsSync(dir)).toBe(true);
	});
});

describe("sweepRemoteTransferDirectories", () => {
	it("removes every workspace and bundle on the server that has no live job", async () => {
		createExportJob("remote-live-1", "user-1", "org-1");
		vi.mocked(execAsyncRemote).mockImplementation(async (_id, command) => ({
			stdout: command.startsWith("find ")
				? [
						"remote-orphan-1",
						"remote-orphan-1.dokploy.tar.gz",
						"remote-live-1",
						"remote-live-1.dokploy.tar.gz",
					]
						.map((name) => `/etc/dokploy/transfer/${name}\n`)
						.join("")
				: "",
			stderr: "",
		}));

		await sweepRemoteTransferDirectories(
			["server-1"],
			1_700_000_000_000,
			() =>
				({
					PROJECT_EXPORT_IMPORT_PATH: "/etc/dokploy/transfer",
				}) as any,
		);

		expect(vi.mocked(execAsyncRemote).mock.calls[0]?.[1]).toContain(
			"! -newermt @1700000000",
		);
		const removed = vi
			.mocked(execAsyncRemote)
			.mock.calls.map(([, command]) => command)
			.filter((command) => command.startsWith("rm "));
		expect(removed).toEqual([
			"rm -rf '/etc/dokploy/transfer/remote-orphan-1'",
			"rm -rf '/etc/dokploy/transfer/remote-orphan-1.dokploy.tar.gz'",
		]);
	});

	it("keeps going when one server is unreachable", async () => {
		vi.mocked(execAsyncRemote)
			.mockReset()
			.mockRejectedValueOnce(new Error("ssh down"))
			.mockResolvedValue({ stdout: "", stderr: "" });

		await expect(
			sweepRemoteTransferDirectories(["down", "up"], Date.now(), fakePaths),
		).resolves.toBeUndefined();
		expect(vi.mocked(execAsyncRemote).mock.calls.map(([id]) => id)).toEqual([
			"down",
			"up",
		]);
	});
});
