import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMount } from "@dokploy/server/services/mount";
import {
	createFile,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({
	db: { insert: mocks.insert },
}));

const makeFilesDir = () =>
	fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-file-mounts-"));

describe("file mounts", () => {
	beforeEach(() => {
		mocks.insert.mockReset();
	});

	it("createFile replaces a directory Docker created at the mount path", async () => {
		const filesDir = makeFilesDir();
		fs.mkdirSync(path.join(filesDir, "sql/init.sql"), { recursive: true });

		await createFile(filesDir, "sql/init.sql", "CREATE TABLE t (id int);");

		const target = path.join(filesDir, "sql/init.sql");
		expect(fs.statSync(target).isFile()).toBe(true);
		expect(fs.readFileSync(target, "utf-8")).toBe("CREATE TABLE t (id int);");
	});

	it("getCreateFileCommand replaces a directory Docker created at the mount path", () => {
		const filesDir = makeFilesDir();
		fs.mkdirSync(path.join(filesDir, "app.conf"));

		execSync(getCreateFileCommand(filesDir, "app.conf", "listen = 8080"), {
			shell: "/bin/sh",
		});

		const target = path.join(filesDir, "app.conf");
		expect(fs.statSync(target).isFile()).toBe(true);
		expect(fs.readFileSync(target, "utf-8")).toBe("listen = 8080");
	});

	it.each([undefined, "", "   "])(
		"createMount rejects a file mount with filePath %j before inserting it",
		async (filePath) => {
			await expect(
				createMount({
					serviceId: "compose-id",
					serviceType: "compose",
					type: "file",
					mountPath: "/",
					filePath,
					content: "listen = 8080",
				}),
			).rejects.toThrow("File path is required for file mounts");
			expect(mocks.insert).not.toHaveBeenCalled();
		},
	);
});
