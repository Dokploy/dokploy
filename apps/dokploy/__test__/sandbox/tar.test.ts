import { Readable } from "node:stream";
import {
	buildSandboxDirectoryTar,
	buildSandboxFileTar,
	extractSandboxFile,
	SandboxFileTooLargeError,
	SandboxNotRegularFileError,
} from "@dokploy/server/utils/sandbox/tar";
import { describe, expect, it } from "vitest";

type Entry = {
	name: string;
	type: string;
	mode: number;
	uid: number;
	gid: number;
	size: number;
	content: string;
};

const TYPES: Record<string, string> = {
	"0": "file",
	"\0": "file",
	"5": "directory",
};

// Minimal ustar reader: 512-byte header blocks with octal numeric fields.
const readTar = (buffer: Buffer): Entry[] => {
	const entries: Entry[] = [];
	let offset = 0;
	const field = (start: number, length: number) =>
		buffer
			.subarray(offset + start, offset + start + length)
			.toString("utf8")
			.replace(/\0.*$/s, "");
	const octal = (start: number, length: number) =>
		Number.parseInt(field(start, length).trim() || "0", 8);
	while (offset + 512 <= buffer.length) {
		const name = field(0, 100);
		if (!name) break;
		const size = octal(124, 12);
		const typeflag = buffer[offset + 156] ?? 0;
		entries.push({
			name,
			type: TYPES[String.fromCharCode(typeflag)] ?? "other",
			mode: octal(100, 8),
			uid: octal(108, 8),
			gid: octal(116, 8),
			size,
			content: buffer
				.subarray(offset + 512, offset + 512 + size)
				.toString("utf8"),
		});
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return entries;
};

describe("buildSandboxFileTar", () => {
	it("packs a single file with the requested ownership and mode", async () => {
		const tar = await buildSandboxFileTar({
			name: "main.py",
			content: Buffer.from("print('hi')\n"),
			uid: 1000,
			gid: 1000,
			mode: 0o600,
		});
		const entries = await readTar(tar);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			name: "main.py",
			type: "file",
			mode: 0o600,
			uid: 1000,
			gid: 1000,
			size: 12,
			content: "print('hi')\n",
		});
	});

	it("defaults to root ownership and 0644", async () => {
		const entries = await readTar(
			await buildSandboxFileTar({ name: "a.txt", content: Buffer.alloc(0) }),
		);
		expect(entries[0]).toMatchObject({ mode: 0o644, uid: 0, gid: 0, size: 0 });
	});
});

describe("buildSandboxDirectoryTar", () => {
	it("packs a directory entry with a trailing slash", async () => {
		const entries = await readTar(
			await buildSandboxDirectoryTar({ name: "user", uid: 1000, gid: 1000 }),
		);
		expect(entries[0]).toMatchObject({
			name: "user/",
			type: "directory",
			mode: 0o755,
			uid: 1000,
			gid: 1000,
		});
	});
});

describe("extractSandboxFile", () => {
	it("extracts the first regular file", async () => {
		const tar = await buildSandboxFileTar({
			name: "out.txt",
			content: Buffer.from("hello"),
		});
		const file = await extractSandboxFile(Readable.from(tar), 1024);
		expect(file.name).toBe("out.txt");
		expect(file.content.toString()).toBe("hello");
	});

	it("rejects files over the limit", async () => {
		const tar = await buildSandboxFileTar({
			name: "big.bin",
			content: Buffer.alloc(2048, 1),
		});
		await expect(
			extractSandboxFile(Readable.from(tar), 1024),
		).rejects.toBeInstanceOf(SandboxFileTooLargeError);
	});

	it("rejects a directory archive even when it contains files", async () => {
		const dir = await buildSandboxDirectoryTar({ name: "proj" });
		const file = await buildSandboxFileTar({
			name: "proj/main.py",
			content: Buffer.from("print(1)"),
		});
		// tar-stream pads each archive with two zero blocks; strip the first
		// archive's end-of-archive marker so the entries are read as one tar.
		const combined = Buffer.concat([dir.subarray(0, dir.length - 1024), file]);
		await expect(
			extractSandboxFile(Readable.from(combined), 1024),
		).rejects.toBeInstanceOf(SandboxNotRegularFileError);
	});

	it("rejects archives without a regular file", async () => {
		const tar = await buildSandboxDirectoryTar({ name: "dir" });
		await expect(
			extractSandboxFile(Readable.from(tar), 1024),
		).rejects.toBeInstanceOf(SandboxNotRegularFileError);
	});
});
