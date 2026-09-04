import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { localFiles } from "@dokploy/server/utils/ai/file-access";
import {
	isAllowedSourcePath,
	SourceReader,
} from "@dokploy/server/utils/ai/source-reader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/server", () => ({ findServerById: vi.fn() }));
let directory: string;
let reader: SourceReader;
beforeEach(async () => {
	directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "dokploy-ai-source-test-"),
	);
	reader = new SourceReader(directory, localFiles);
	await reader.initialize();
});
afterEach(async () => {
	await fs.rm(directory, { recursive: true, force: true });
});

describe("source inspection", () => {
	it.each([
		"../secret",
		"/etc/passwd",
		"src/../../secret",
		"src\\secret",
		".env",
		".env.production",
		".git/config",
		"node_modules/a.js",
		"dist/a.js",
		"a.pem",
		".npmrc",
		"credentials.json",
		"secrets.yaml",
		"a.png",
	])("excludes %s from every operation", async (file) => {
		expect(isAllowedSourcePath(file)).toBe(false);
		await expect(reader.readFile(file)).rejects.toThrow();
	});
	it("reads numbered excerpts and searches literal text", async () => {
		await fs.writeFile(
			path.join(directory, "app.ts"),
			"const port = 8080;\nthrow new Error('address in use');\n",
		);
		expect(await reader.readFile("app.ts", 2, 2)).toEqual({
			path: "app.ts",
			content: "2: throw new Error('address in use');",
		});
		expect((await reader.searchFiles("Error('", "app.ts")).matches).toEqual([
			{ path: "app.ts", line: 2, text: "throw new Error('address in use');" },
		]);
		expect([...reader.inspectedFiles]).toEqual(["app.ts"]);
	});
	it("does not list excluded files or follow file/directory symlinks", async () => {
		await fs.writeFile(path.join(directory, ".env"), "SECRET=value");
		await fs.symlink("/etc/passwd", path.join(directory, "leak.ts"));
		await fs.symlink("/etc", path.join(directory, "outside"));
		expect((await reader.listFiles()).files).toEqual([]);
		await expect(reader.readFile("leak.ts")).rejects.toThrow("Symbolic");
		await expect(reader.readFile("outside/passwd")).rejects.toThrow("Symbolic");
	});
	it("rejects binary content and embedded private keys", async () => {
		await fs.writeFile(
			path.join(directory, "binary.ts"),
			Buffer.from([1, 0, 2]),
		);
		await fs.writeFile(
			path.join(directory, "key.ts"),
			"-----BEGIN RSA PRIVATE KEY-----",
		);
		await expect(reader.readFile("binary.ts")).rejects.toThrow("Binary");
		await expect(reader.readFile("key.ts")).rejects.toThrow("private key");
		expect(reader.inspectedFiles.size).toBe(0);
	});
	it("limits individual files and total source reads", async () => {
		for (let index = 0; index < 5; index++)
			await fs.writeFile(
				path.join(directory, `${index}.ts`),
				"x".repeat(70000),
			);
		for (let index = 0; index < 4; index++)
			expect(
				(await reader.readFile(`${index}.ts`)).content.length,
			).toBeLessThan(66000);
		await expect(reader.readFile("4.ts")).rejects.toThrow("budget");
		expect([...reader.notices].join(" ")).toContain("beginning");
	});
	it("stops after twenty unique file reads", async () => {
		for (let index = 0; index < 21; index++)
			await fs.writeFile(path.join(directory, `${index}.ts`), "const x = 1;");
		for (let index = 0; index < 20; index++)
			await reader.readFile(`${index}.ts`);
		await expect(reader.readFile("20.ts")).rejects.toThrow("budget");
	});
	it("enforces resolved-path containment through a remote-style adapter", async () => {
		await fs.writeFile(path.join(directory, "app.ts"), "safe");
		const read = vi.fn(localFiles.read);
		const remote = new SourceReader(directory, {
			...localFiles,
			read,
			realpath: async (value) =>
				value === directory ? directory : "/etc/passwd",
		});
		await remote.initialize();
		await expect(remote.readFile("app.ts")).rejects.toThrow("outside");
		expect(read).not.toHaveBeenCalled();
	});
});
