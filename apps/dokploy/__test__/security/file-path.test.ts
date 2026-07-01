import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { paths as dokployPaths } from "@dokploy/server/constants";
import {
	createFile,
	generateFileMounts,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import {
	normalizeRelativeFilePath,
	resolveFilePathInsideDirectory,
} from "@dokploy/server/utils/filesystem/safe-path";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("safe relative file paths", () => {
	it("normalizes relative and leading-slash file paths", () => {
		expect(normalizeRelativeFilePath("config/app.conf")).toBe(
			"config/app.conf",
		);
		expect(normalizeRelativeFilePath("/config/app.conf")).toBe(
			"config/app.conf",
		);
		expect(normalizeRelativeFilePath("config\\app.conf")).toBe(
			"config/app.conf",
		);
		expect(normalizeRelativeFilePath("pages/[id].tsx")).toBe("pages/[id].tsx");
		expect(normalizeRelativeFilePath("app/(dashboard)/page.tsx")).toBe(
			"app/(dashboard)/page.tsx",
		);
		expect(normalizeRelativeFilePath("src/@types/index.d.ts")).toBe(
			"src/@types/index.d.ts",
		);
		expect(normalizeRelativeFilePath("lib/foo+bar.ts")).toBe("lib/foo+bar.ts");
	});

	it("rejects path traversal and shell metacharacters", () => {
		const invalidPaths = [
			"../secret",
			"config/../../secret",
			"$(id)",
			"`id`",
			"config/app.conf;id",
			"config/app.conf&id",
			"config/app.conf|id",
			"config/app.conf>id",
			"config/app.conf\nid",
			"config/app.conf\0",
			"C:\\Windows\\win.ini",
			"\\\\server\\share\\secret",
			".git/config",
			"src/.git/HEAD",
		];

		for (const filePath of invalidPaths) {
			expect(() => normalizeRelativeFilePath(filePath)).toThrow(
				"Invalid file path",
			);
		}
	});

	it("resolves normalized paths inside the requested base directory", () => {
		expect(
			resolveFilePathInsideDirectory(
				"/srv/dokploy/app/files",
				"/config/app.conf",
			),
		).toMatchObject({
			fullPath: "/srv/dokploy/app/files/config/app.conf",
			relativePath: "config/app.conf",
		});
	});
});

describe("file mount command builders", () => {
	it("rejects unsafe file paths before generating shell commands", () => {
		expect(() =>
			getCreateFileCommand("/srv/dokploy/app/files", "../secret", "content"),
		).toThrow("Invalid file path");
		expect(() =>
			getCreateFileCommand("/srv/dokploy/app/files", "config/$(id)", "content"),
		).toThrow("Invalid file path");
	});

	it("quotes safe paths when generating remote file creation commands", () => {
		const command = getCreateFileCommand(
			"/srv/dokploy/app/files",
			"config/app.conf",
			"PORT=3000",
		);

		expect(command).toContain("/srv/dokploy/app/files/config/app.conf");
		expect(command).toContain('real_parent="$(cd "$parent" && pwd -P)"');
		expect(command).toContain('if [ -L "$file" ]; then');
		expect(command).not.toContain("$(id)");
		expect(command).not.toContain("../");
	});

	it("blocks remote directory creation through symlink parents", async () => {
		const rootPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "dokploy-file-directory-"),
		);

		try {
			const basePath = path.join(rootPath, "app", "files");
			const outsidePath = path.join(rootPath, "outside");
			await fs.mkdir(path.join(basePath, "config"), { recursive: true });
			await fs.mkdir(outsidePath);
			await fs.symlink(outsidePath, path.join(basePath, "config", "escape"));

			const command = getCreateFileCommand(
				basePath,
				"config/escape/new-dir/",
				"",
			);

			await expect(execFileAsync("sh", ["-c", command])).rejects.toThrow();
			await expect(
				fs.stat(path.join(outsidePath, "new-dir")),
			).rejects.toThrow();
		} finally {
			await fs.rm(rootPath, { force: true, recursive: true });
		}
	});

	it("rejects symlink escapes before local file mount writes", async () => {
		const rootPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "dokploy-file-path-"),
		);

		try {
			const basePath = path.join(rootPath, "app", "files");
			const outsidePath = path.join(rootPath, "outside");
			await fs.mkdir(path.join(basePath, "config"), { recursive: true });
			await fs.mkdir(outsidePath);
			await fs.symlink(outsidePath, path.join(basePath, "config", "escape"));

			await expect(
				createFile(basePath, "config/escape/secret.txt", "SECRET=value"),
			).rejects.toThrow("Invalid file path");

			await expect(
				fs.readFile(path.join(outsidePath, "secret.txt"), "utf8"),
			).rejects.toThrow();
		} finally {
			await fs.rm(rootPath, { force: true, recursive: true });
		}
	});

	it("rejects unsafe file mount sources before Docker bind generation", () => {
		expect(() =>
			generateFileMounts("app", {
				serverId: null,
				mounts: [
					{
						type: "file",
						filePath: "../secret",
						mountPath: "/etc/secret",
					},
				],
			} as any),
		).toThrow("Invalid file path");
	});

	it("rejects symlink escapes before Docker file mount generation", async () => {
		const appName = `file-mount-symlink-${process.pid}`;
		const serviceRoot = path.join(
			dokployPaths(false).APPLICATIONS_PATH,
			appName,
		);
		let outsidePath: string | null = null;

		try {
			const filesRoot = path.join(serviceRoot, "files");
			outsidePath = await fs.mkdtemp(
				path.join(os.tmpdir(), "dokploy-file-mount-outside-"),
			);
			await fs.mkdir(path.join(filesRoot, "config"), { recursive: true });
			await fs.symlink(outsidePath, path.join(filesRoot, "config", "escape"));

			expect(() =>
				generateFileMounts(appName, {
					serverId: null,
					mounts: [
						{
							type: "file",
							filePath: "config/escape/secret.txt",
							mountPath: "/etc/secret",
						},
					],
				} as any),
			).toThrow("Invalid file path");
		} finally {
			await fs.rm(serviceRoot, { force: true, recursive: true });
			if (outsidePath) {
				await fs.rm(outsidePath, { force: true, recursive: true });
			}
		}
	});
});
