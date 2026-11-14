import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readDirectory } from "@dokploy/server/services/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: mocks.execAsyncRemote,
}));

describe("readDirectory on a remote server", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), "dokploy-read-dir-"));
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, script: string) => ({
				stdout: execFileSync("bash", ["-c", script], {
					cwd: root,
					encoding: "utf8",
				}),
				stderr: "",
			}),
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("does not execute shell code from file names", async () => {
		const name = "a'$(touch PWNED)'.yml";
		writeFileSync(path.join(root, name), "");

		const result = await readDirectory(root, "server-1");

		expect(existsSync(path.join(root, "PWNED"))).toBe(false);
		expect(result).toEqual([{ id: path.join(root, name), name, type: "file" }]);
	});

	it("returns nested entries with quotes and backslashes intact", async () => {
		mkdirSync(path.join(root, "dynamic"));
		const name = 'q"x\\y.yml';
		writeFileSync(path.join(root, "dynamic", name), "");

		const result = await readDirectory(root, "server-1");

		expect(result).toEqual([
			{
				id: path.join(root, "dynamic"),
				name: "dynamic",
				type: "directory",
				children: [
					{ id: path.join(root, "dynamic", name), name, type: "file" },
				],
			},
		]);
	});
});
