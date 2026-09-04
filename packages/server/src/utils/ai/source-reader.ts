import path from "node:path";
import type { FileAccess } from "./file-access";

const MAX_FILE_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 256 * 1024;
const EXCLUDED =
	/^(?:\.env(?:\..*)?|\.git|\.svn|\.hg|\.ssh|\.aws|\.npmrc|\.pypirc|\.netrc|\.docker|node_modules|vendor|dist|build|coverage|\.next|\.nuxt|\.output|\.cache|__pycache__|target|\.venv|venv|secrets?(?:\..*)?|credentials?(?:\..*)?|id_rsa|id_ed25519)$/i;
const BINARY_OR_SECRET =
	/\.(?:pem|key|p12|pfx|keystore|crt|der|jks|png|jpe?g|gif|ico|webp|pdf|zip|gz|tar|woff2?|ttf|mp[34]|sqlite3?|db|exe|dll|so|wasm|lock|map)$/i;

export function isAllowedSourcePath(relative: string) {
	return (
		!!relative &&
		!path.posix.isAbsolute(relative) &&
		relative.length <= 500 &&
		![...relative].some(
			(character) => character === "\\" || character.charCodeAt(0) < 32,
		) &&
		relative
			.split("/")
			.every(
				(part) =>
					!!part && part !== "." && part !== ".." && !EXCLUDED.test(part),
			) &&
		!BINARY_OR_SECRET.test(relative)
	);
}

/** The same allowlist and path checks apply to all three model tools. */
export class SourceReader {
	readonly inspectedFiles = new Set<string>();
	readonly notices = new Set<string>();
	private reads = 0;
	private bytes = 0;
	private outputBytes = 0;
	private deadline = Date.now() + 120000;
	private toolCalls = 0;
	private root = "";
	private queue: string[] = [""];
	private entriesVisited = 0;
	private indexed: string[] = [];
	private cache = new Map<string, string>();

	constructor(
		private directory: string,
		private files: FileAccess,
	) {}

	async initialize() {
		if ((await this.files.lstat(this.directory)).isSymbolicLink())
			throw new Error("Source checkout is a symbolic link");
		this.root = await this.files.realpath(this.directory);
		if (this.root !== path.posix.resolve(this.directory))
			throw new Error("Source checkout contains a symbolic link");
		if (!(await this.files.lstat(this.root)).isDirectory())
			throw new Error("Source checkout is unavailable");
	}

	private async resolve(relative: string) {
		if (!this.root || !isAllowedSourcePath(relative))
			throw new Error("Source path is excluded");
		let current = this.root;
		for (const part of relative.split("/")) {
			current = path.posix.join(current, part);
			if ((await this.files.lstat(current)).isSymbolicLink())
				throw new Error("Symbolic links cannot be inspected");
		}
		const real = await this.files.realpath(current);
		if (!real.startsWith(`${this.root}/`))
			throw new Error("Source path is outside this checkout");
		return real;
	}

	private consumeCall() {
		this.checkDeadline();
		if (++this.toolCalls > 40) {
			this.notices.add(
				"Source tool-call limit reached; investigation may be incomplete.",
			);
			throw new Error(
				"Source tool-call limit reached. Finish the diagnosis using available evidence.",
			);
		}
	}

	private checkDeadline() {
		if (Date.now() > this.deadline) {
			this.notices.add(
				"Source investigation timed out; findings use the evidence already collected.",
			);
			throw new Error("Source investigation timed out");
		}
	}

	private boundedOutput(text: string) {
		const buffer = Buffer.from(text);
		const remaining = MAX_SOURCE_BYTES - this.outputBytes;
		if (buffer.length > remaining)
			this.notices.add(
				"Source output budget reached; investigation may be incomplete.",
			);
		this.outputBytes += Math.min(buffer.length, remaining);
		return buffer.subarray(0, remaining).toString("utf8");
	}

	async listFiles(query = "") {
		this.consumeCall();
		while (
			this.queue.length &&
			this.entriesVisited < 10000 &&
			this.indexed.length < 2000
		) {
			const directory = this.queue.shift()!;
			const absolute = directory ? await this.resolve(directory) : this.root;
			const entries = (await this.files.readdir(absolute)).sort();
			for (const name of entries) {
				this.checkDeadline();
				if (++this.entriesVisited > 10000 || this.indexed.length >= 2000) break;
				const relative = directory ? `${directory}/${name}` : name;
				if (!isAllowedSourcePath(relative) || relative.split("/").length > 16)
					continue;
				try {
					const stat = await this.files.lstat(
						path.posix.join(this.root, relative),
					);
					if (stat.isSymbolicLink()) continue;
					if (stat.isDirectory()) this.queue.push(relative);
					else if (stat.isFile()) this.indexed.push(relative);
				} catch {
					this.notices.add("Some source files could not be listed.");
				}
			}
		}
		if (
			this.queue.length ||
			this.entriesVisited >= 10000 ||
			this.indexed.length >= 2000
		) {
			this.notices.add(
				"Source file listing was limited; use log paths to read specific files.",
			);
			this.queue = [];
		}
		const matches = this.indexed.filter((file) => file.includes(query));
		return { files: matches.slice(0, 200), hasMore: matches.length > 200 };
	}

	private async content(relative: string) {
		if (!isAllowedSourcePath(relative))
			throw new Error("Source path is excluded");
		const cached = this.cache.get(relative);
		if (cached !== undefined) return cached;
		if (this.reads >= 20 || this.bytes >= MAX_SOURCE_BYTES) {
			this.notices.add(
				"Source read budget reached; investigation may be incomplete.",
			);
			throw new Error(
				"Source read budget reached. Finish the diagnosis using available evidence.",
			);
		}
		const absolute = await this.resolve(relative);
		const stat = await this.files.lstat(absolute);
		if (!stat.isFile())
			throw new Error("Only regular source files can be inspected");
		this.reads++;
		const size = Math.min(
			stat.size,
			MAX_FILE_BYTES,
			MAX_SOURCE_BYTES - this.bytes,
		);
		const buffer = await this.files.read(absolute, 0, size);
		this.bytes += buffer.length;
		if (buffer.includes(0)) throw new Error("Binary files cannot be inspected");
		if (size < stat.size)
			this.notices.add(
				`Only the beginning of ${relative} was available within the source budget.`,
			);
		const text = buffer.toString("utf8");
		// Refuse accidentally embedded private keys even in otherwise ordinary source files.
		if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text))
			throw new Error("File contains private key material");
		this.inspectedFiles.add(relative);
		this.cache.set(relative, text);
		return text;
	}

	async readFile(relative: string, startLine = 1, endLine = 200) {
		this.consumeCall();
		const lines = (await this.content(relative)).split("\n");
		return {
			path: relative,
			content: this.boundedOutput(
				lines
					.slice(startLine - 1, endLine)
					.map((line, index) => `${startLine + index}: ${line}`)
					.join("\n"),
			),
		};
	}

	async searchFiles(query: string, fileQuery = "") {
		const { files } = await this.listFiles(fileQuery);
		const matches: Array<{ path: string; line: number; text: string }> = [];
		for (const file of files) {
			this.checkDeadline();
			try {
				const lines = (await this.content(file)).split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (lines[i]?.includes(query))
						matches.push({
							path: file,
							line: i + 1,
							text: this.boundedOutput(lines[i]!.slice(0, 500)),
						});
					if (matches.length >= 50) return { matches, limited: true };
				}
			} catch {
				this.notices.add(
					"Source search was partial because some files were excluded, unavailable, or exceeded the read budget.",
				);
				if (this.reads >= 20 || this.bytes >= MAX_SOURCE_BYTES)
					return { matches, limited: true };
			}
		}
		return { matches, limited: false };
	}
}
