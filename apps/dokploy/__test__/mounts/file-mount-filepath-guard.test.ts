import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createFile,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import { describe, expect, it } from "vitest";

// dokploy#5292: a file mount with an empty filePath made path.join(outputPath, "")
// === outputPath, so the mount's content was written onto the service's `files/`
// directory path itself - turning it into a regular file and breaking every
// sibling mount with "not a directory".

describe("file mount filePath guards (dokploy#5292)", () => {
	it("createFile refuses to write when filePath is empty", async () => {
		const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-5292-"));
		await expect(createFile(outputPath, "", "secret-content")).rejects.toThrow(
			/filePath is required/,
		);
		// the directory path must survive as a directory, not become a file
		expect(fs.statSync(outputPath).isDirectory()).toBe(true);
	});

	it("createFile refuses a whitespace-only filePath", async () => {
		const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-5292-"));
		await expect(createFile(outputPath, "   ", "x")).rejects.toThrow(
			/filePath is required/,
		);
	});

	it("createFile still writes real files", async () => {
		const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-5292-"));
		await createFile(outputPath, "nested/config.yml", "key: value");
		expect(
			fs.readFileSync(path.join(outputPath, "nested/config.yml"), "utf-8"),
		).toBe("key: value");
	});

	it("createFile still creates directory mounts (trailing slash)", async () => {
		const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-5292-"));
		await createFile(outputPath, "mydir/", "");
		expect(fs.statSync(path.join(outputPath, "mydir")).isDirectory()).toBe(
			true,
		);
	});

	it("getCreateFileCommand refuses an empty filePath", () => {
		expect(() => getCreateFileCommand("/srv/app/files", "", "x")).toThrow(
			/filePath is required/,
		);
	});

	it("getCreateFileCommand still builds the remote write command", () => {
		const cmd = getCreateFileCommand("/srv/app/files", "a/b.txt", "hello");
		expect(cmd).toContain("mkdir -p");
		expect(cmd).toContain("base64 -d");
	});
});

describe("file mount filePath resolves-inside guard (greptile follow-up)", () => {
	it('createFile refuses a "." filePath (resolves to the directory itself)', async () => {
		const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-5292-"));
		await expect(createFile(outputPath, ".", "x")).rejects.toThrow(
			/inside the service's files directory/,
		);
		expect(fs.statSync(outputPath).isDirectory()).toBe(true);
	});

	it('createFile still allows "."-prefixed real files', async () => {
		const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-5292-"));
		await createFile(outputPath, "./ok.txt", "y");
		expect(fs.readFileSync(path.join(outputPath, "ok.txt"), "utf-8")).toBe("y");
	});

	it('getCreateFileCommand refuses a "." filePath', () => {
		expect(() => getCreateFileCommand("/srv/app/files", ".", "x")).toThrow(
			/inside the service's files directory/,
		);
	});
});
