import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { APPLICATIONS_PATH } from "~/server/constants";
import { unzipDrop } from "~/server/utils/builders/drop";

if (typeof window === "undefined") {
	const undici = require("undici");
	globalThis.File = undici.File as any;
	globalThis.FileList = undici.FileList as any;
}

vi.mock("~/server/constants", () => ({
	APPLICATIONS_PATH: "./__test__/drop/zips/output",
}));

describe("unzipDrop using real zip files", () => {
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("should correctly extract a zip with a single root folder", async () => {
		const appName = "single-file";
		const outputPath = path.join(APPLICATIONS_PATH, appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/single-file.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, appName);

		const files = await fs.readdir(outputPath, { withFileTypes: true });
		expect(files.some((f) => f.name === "test.txt")).toBe(true);
	});

	it("should correctly extract a zip with a single root folder and a subfolder", async () => {
		const appName = "folderwithfile";
		const outputPath = path.join(APPLICATIONS_PATH, appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/folder-with-file.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, appName);

		const files = await fs.readdir(outputPath, { withFileTypes: true });
		expect(files.some((f) => f.name === "folder1.txt")).toBe(true);
	});

	it("should correctly extract a zip with multiple root folders", async () => {
		const appName = "two-folders";
		const outputPath = path.join(APPLICATIONS_PATH, appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/two-folders.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, appName);

		const files = await fs.readdir(outputPath, { withFileTypes: true });

		expect(files.some((f) => f.name === "folder1")).toBe(true);
		expect(files.some((f) => f.name === "folder2")).toBe(true);
	});

	it("should correctly extract a zip with a single root with a file", async () => {
		const appName = "nested";
		const outputPath = path.join(APPLICATIONS_PATH, appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/nested.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, appName);

		const files = await fs.readdir(outputPath, { withFileTypes: true });

		expect(files.some((f) => f.name === "folder1")).toBe(true);
		expect(files.some((f) => f.name === "folder2")).toBe(true);
		expect(files.some((f) => f.name === "folder3")).toBe(true);
	});

	it("should correctly extract a zip with a single root with a folder", async () => {
		const appName = "folder-with-sibling-file";
		const outputPath = path.join(APPLICATIONS_PATH, appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/folder-with-sibling-file.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, appName);

		const files = await fs.readdir(outputPath, { withFileTypes: true });

		expect(files.some((f) => f.name === "folder1")).toBe(true);
		expect(files.some((f) => f.name === "test.txt")).toBe(true);
	});
});
