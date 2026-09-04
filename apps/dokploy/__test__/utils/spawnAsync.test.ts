import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnAsync } from "@dokploy/server/utils/process/spawnAsync";
import { afterAll, describe, expect, it } from "vitest";

const NODE = process.execPath;
const dirs: string[] = [];

const writeScript = (name: string, body: string) => {
	const dir = mkdtempSync(path.join(tmpdir(), "spawnasync-utf8-"));
	dirs.push(dir);
	const file = path.join(dir, `${name}.mjs`);
	writeFileSync(file, body, "utf8");
	return file;
};

afterAll(() => {
	for (const dir of dirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const REPLACEMENT = "\uFFFD";
const hasReplacement = (s: string) => s.includes(REPLACEMENT);

describe("spawnAsync streaming UTF-8 decoding", () => {
	it("decodes a multi-byte sequence split across two data events", async () => {
		const file = writeScript(
			"split",
			`process.stdout.write(Buffer.from([0xe2]));
			setTimeout(() => process.stdout.write(Buffer.from([0x94, 0x80])), 50);`,
		);
		let streamed = "";
		const chunkByteSizes: number[] = [];
		const result = spawnAsync(NODE, [file], (d) => {
			streamed += d;
		});
		result.child.stdout?.on("data", (b: Buffer) => {
			chunkByteSizes.push(b.length);
		});
		const captured = await result;
		expect(chunkByteSizes.length).toBeGreaterThanOrEqual(2);
		expect(chunkByteSizes[0]).toBe(1);
		expect(streamed).toBe("\u2500");
		expect(hasReplacement(streamed)).toBe(false);
		expect(captured.toString("utf8")).toBe("\u2500");
	});

	it("preserves a multi-byte sequence aligned to the 64 KiB chunk boundary", async () => {
		const file = writeScript(
			"boundary",
			`const f = Buffer.alloc(65535, 0x78);
			const e = Buffer.from("\\u20AC\\n", "utf8");
			process.stdout.write(Buffer.concat([f, e]));`,
		);
		let streamed = "";
		const chunkByteSizes: number[] = [];
		const result = spawnAsync(NODE, [file], (d) => {
			streamed += d;
		});
		result.child.stdout?.on("data", (b: Buffer) => {
			chunkByteSizes.push(b.length);
		});
		const captured = await result;
		const expected = `${"x".repeat(65535)}\u20AC\n`;
		expect(streamed).toBe(expected);
		expect(hasReplacement(streamed)).toBe(false);
		expect(captured.toString("utf8")).toBe(expected);
		expect(streamed).toBe(captured.toString("utf8"));
		expect(chunkByteSizes.length).toBeGreaterThanOrEqual(2);
	});

	it("decodes a multi-byte sequence split across two stderr data events", async () => {
		const file = writeScript(
			"stderr-split",
			`process.stderr.write(Buffer.from([0xe2]));
			setTimeout(() => process.stderr.write(Buffer.from([0x94, 0x80])), 50);`,
		);
		let streamed = "";
		const stderrChunks: Buffer[] = [];
		const result = spawnAsync(NODE, [file], (d) => {
			streamed += d;
		});
		result.child.stderr?.on("data", (b: Buffer) => {
			stderrChunks.push(b);
		});
		const captured = await result;
		const stderrStr = Buffer.concat(stderrChunks).toString("utf8");
		expect(stderrStr).toBe("\u2500");
		expect(streamed).toBe("\u2500");
		expect(hasReplacement(streamed)).toBe(false);
		expect(captured.toString("utf8")).toBe("");
	});

	it("flushes a split trailing incomplete multi-byte sequence via decoder.end()", async () => {
		const file = writeScript(
			"incomplete",
			`process.stdout.write(Buffer.from([0xe2]));
			setTimeout(() => process.stdout.write(Buffer.from([0x82])), 50);`,
		);
		let streamed = "";
		const result = spawnAsync(NODE, [file], (d) => {
			streamed += d;
		});
		const captured = await result;
		expect(streamed).toBe(REPLACEMENT);
		expect(captured.toString("utf8")).toBe(REPLACEMENT);
		expect(streamed).toBe(captured.toString("utf8"));
	});

	it("still rejects on non-zero exit with correctly decoded captured stderr", async () => {
		const file = writeScript(
			"fail",
			`process.stdout.write("partial stdout \\u20AC\\n", () => {
				process.stderr.write("err \\u20AC line\\n", () => process.exit(2));
			});`,
		);
		let streamed = "";
		const result = spawnAsync(NODE, [file], (d) => {
			streamed += d;
		});
		const error = (await result.catch((e: unknown) => e)) as Error & {
			code: number;
		};
		expect(error).toBeInstanceOf(Error);
		expect(error.code).toBe(2);
		expect(error.message).toBe("err \u20AC line\n");
		expect(streamed).toBe("partial stdout \u20AC\nerr \u20AC line\n");
		expect(hasReplacement(streamed)).toBe(false);
	});
});
