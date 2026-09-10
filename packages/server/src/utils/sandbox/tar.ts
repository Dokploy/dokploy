import type { Readable } from "node:stream";
import { extract, pack } from "tar-stream";

export interface SandboxTarFile {
	name: string;
	content: Buffer;
	mode?: number;
	uid?: number;
	gid?: number;
}

export interface SandboxTarDirectory {
	name: string;
	mode?: number;
	uid?: number;
	gid?: number;
}

const toBuffer = (chunk: unknown) =>
	Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string);

const collect = async (stream: AsyncIterable<unknown>) => {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(toBuffer(chunk));
	}
	return Buffer.concat(chunks);
};

export const buildSandboxFileTar = async (file: SandboxTarFile) => {
	const tar = pack();
	tar.entry(
		{
			name: file.name,
			type: "file",
			size: file.content.length,
			mode: file.mode ?? 0o644,
			uid: file.uid ?? 0,
			gid: file.gid ?? 0,
			mtime: new Date(),
		},
		file.content,
	);
	tar.finalize();
	return collect(tar);
};

export const buildSandboxDirectoryTar = async (dir: SandboxTarDirectory) => {
	const tar = pack();
	tar.entry({
		name: dir.name.endsWith("/") ? dir.name : `${dir.name}/`,
		type: "directory",
		mode: dir.mode ?? 0o755,
		uid: dir.uid ?? 0,
		gid: dir.gid ?? 0,
		mtime: new Date(),
	});
	tar.finalize();
	return collect(tar);
};

export class SandboxFileTooLargeError extends Error {
	constructor(maxBytes: number) {
		super(`File exceeds the ${maxBytes} byte limit`);
		this.name = "SandboxFileTooLargeError";
	}
}

export class SandboxNotRegularFileError extends Error {
	constructor() {
		super("Path is not a regular file");
		this.name = "SandboxNotRegularFileError";
	}
}

export const extractSandboxFile = (
	source: NodeJS.ReadableStream,
	maxBytes: number,
): Promise<{ name: string; content: Buffer }> =>
	new Promise((resolve, reject) => {
		const extractor = extract();
		let found: { name: string; content: Buffer } | null = null;
		let settled = false;

		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			extractor.destroy();
			(source as Readable).destroy?.();
			reject(error);
		};

		let first = true;
		extractor.on("entry", (header, entryStream, next) => {
			// Docker returns the requested path as the first entry; a directory
			// tar would otherwise leak its first file as if it were the target.
			if (first && header.type !== "file") {
				fail(new SandboxNotRegularFileError());
				return;
			}
			first = false;
			if (found || header.type !== "file") {
				entryStream.on("end", next);
				entryStream.resume();
				return;
			}
			const chunks: Buffer[] = [];
			let size = 0;
			entryStream.on("data", (data: unknown) => {
				const chunk = toBuffer(data);
				size += chunk.length;
				if (size > maxBytes) {
					fail(new SandboxFileTooLargeError(maxBytes));
					return;
				}
				chunks.push(chunk);
			});
			entryStream.on("end", () => {
				found = { name: header.name, content: Buffer.concat(chunks) };
				next();
			});
		});
		extractor.on("finish", () => {
			if (settled) return;
			settled = true;
			if (found) resolve(found);
			else reject(new SandboxNotRegularFileError());
		});
		extractor.on("error", fail);
		source.on("error", fail);
		source.pipe(extractor);
	});
