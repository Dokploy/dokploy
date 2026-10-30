import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRemoteDocker: vi.fn(),
	exec: vi.fn(),
	start: vi.fn(),
	inspect: vi.fn(),
	infoArchive: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const { readContainerFileTail } = await import(
	"@dokploy/server/services/container-file-tail"
);
const Docker = createRequire(import.meta.url)("dockerode");

const frame = (content: Buffer | string, channel = 1) => {
	const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
	const header = Buffer.alloc(8);
	header[0] = channel;
	header.writeUInt32BE(body.length, 4);
	return Buffer.concat([header, body]);
};

const respond = (content: Buffer | string, stderr = "", exitCode = 0) => {
	mocks.start.mockResolvedValue(
		Readable.from([frame(content), frame(stderr, 2)]),
	);
	mocks.inspect.mockResolvedValue({ ExitCode: exitCode, Running: false });
};

describe("readContainerFileTail", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.getRemoteDocker.mockResolvedValue({
			getContainer: () => ({
				exec: mocks.exec,
				infoArchive: mocks.infoArchive,
			}),
			modem: new Docker().modem,
		});
		mocks.exec.mockResolvedValue({
			start: mocks.start,
			inspect: mocks.inspect,
		});
		mocks.infoArchive.mockImplementation(async () =>
			Object.assign(Readable.from([]), {
				headers: {
					"x-docker-container-path-stat": Buffer.from(
						JSON.stringify({ mode: 0o644, size: 100 }),
					).toString("base64"),
				},
			}),
		);
		respond("");
	});

	afterEach(() => vi.useRealTimers());

	it("reads only a bounded EOF window before choosing recent lines", async () => {
		respond("old\nrecent\nLATEST_ERROR_MARKER\n");
		const result = await readContainerFileTail("app", "/var/log/app.log", 2);
		expect(mocks.exec).toHaveBeenCalledWith({
			Cmd: ["tail", "-c", "65537", "--", "/var/log/app.log"],
			AttachStdout: true,
			AttachStderr: true,
			Tty: false,
		});
		expect(result).toEqual({
			content: "recent\nLATEST_ERROR_MARKER\n",
			truncated: true,
			truncatedByBytes: false,
			truncatedByLines: true,
		});
	});

	it.each(["", "single", "single\n", "\n"])(
		"preserves short and empty files: %j",
		async (content) => {
			respond(content);
			expect(await readContainerFileTail("app", "/log", 1)).toEqual({
				content,
				truncated: false,
				truncatedByBytes: false,
				truncatedByLines: false,
			});
		},
	);

	it("selects the final line when there is no trailing newline", async () => {
		respond("one\ntwo\nthree");
		expect((await readContainerFileTail("app", "/log", 1)).content).toBe(
			"three",
		);
	});

	it("retains newest bytes of an oversized line, including its EOF marker", async () => {
		respond(`${"x".repeat(57)}LATEST!`);
		const result = await readContainerFileTail("app", "/log", 200, 63);
		expect(result.content).toBe(`${"x".repeat(56)}LATEST!`);
		expect(result.truncatedByBytes).toBe(true);
		expect(Buffer.byteLength(result.content)).toBe(63);
	});

	it("does not invent truncation at the exact byte cap", async () => {
		respond("exact");
		expect(await readContainerFileTail("app", "/log", 1, 5)).toMatchObject({
			content: "exact",
			truncated: false,
		});
	});

	it.each([Buffer.from([0xff]), Buffer.from([0xe4, 0xb8])])(
		"rejects invalid UTF-8 instead of expanding replacement bytes beyond the cap",
		async (content) => {
			respond(content);
			await expect(
				readContainerFileTail("app", "/log", 1, content.length),
			).rejects.toMatchObject({ code: "INVALID_ENCODING" });
		},
	);

	it("drops a split UTF-8 prefix and preserves later Unicode", async () => {
		const body = Buffer.from("🔥中🚀");
		respond(body.subarray(1));
		const result = await readContainerFileTail("app", "/log", 5, 9);
		expect(result.content).toBe("中🚀");
		expect(result.truncatedByBytes).toBe(true);
		expect(result.content).not.toContain("\uFFFD");
	});

	it("passes unusual filenames as one literal argument and uses the remote server", async () => {
		respond("ok");
		const path = "/logs/a '$(touch nope)' ; log.txt";
		await readContainerFileTail("app", path, 1, 100, "remote");
		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("remote");
		expect(mocks.exec.mock.calls[0]?.[0].Cmd.at(-1)).toBe(path);
	});

	it.each([
		[0, 1],
		[5001, 1],
		[1.5, 1],
		[Number.NaN, 1],
		[1, 0],
		[1, 524289],
		[1, 1.5],
		[1, Number.POSITIVE_INFINITY],
	])(
		"rejects invalid limits %s/%s before accessing Docker",
		async (lines, bytes) => {
			await expect(
				readContainerFileTail("app", "/log", lines, bytes),
			).rejects.toMatchObject({ code: "INVALID_INPUT" });
			expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		},
	);

	it.each(["relative", "", "/bad\0path", "x".repeat(4097)])(
		"rejects invalid paths %j",
		async (path) => {
			await expect(readContainerFileTail("app", path)).rejects.toMatchObject({
				code: "INVALID_INPUT",
			});
		},
	);

	it("reports a failed read even when the utility emits partial stdout", async () => {
		respond("partial", "tail: cannot open file: Permission denied", 1);
		await expect(readContainerFileTail("app", "/log")).rejects.toMatchObject({
			code: "READ_FAILED",
		});
	});

	it("reports unavailable tail utilities", async () => {
		respond("", "tail: not found", 127);
		await expect(readContainerFileTail("app", "/log")).rejects.toMatchObject({
			code: "UTILITY_UNAVAILABLE",
		});
	});

	it("reports unavailable containers", async () => {
		mocks.exec.mockRejectedValue({
			statusCode: 404,
			message: "No such container",
		});
		await expect(readContainerFileTail("app", "/log")).rejects.toMatchObject({
			code: "CONTAINER_UNAVAILABLE",
		});
	});

	it("rejects unexpected stdout instead of buffering without a bound", async () => {
		respond("x".repeat(20));
		await expect(
			readContainerFileTail("app", "/log", 1, 10),
		).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
	});

	it("times out and closes a stalled output stream", async () => {
		vi.useFakeTimers();
		const stream = new Readable({ read() {} });
		mocks.start.mockResolvedValue(stream);
		const result = expect(
			readContainerFileTail("app", "/log"),
		).rejects.toMatchObject({ code: "READ_TIMEOUT" });
		await vi.advanceTimersByTimeAsync(10000);
		await result;
		expect(stream.destroyed).toBe(true);
	});

	it("times out while creating an exec before a stream exists", async () => {
		vi.useFakeTimers();
		mocks.exec.mockReturnValue(new Promise(() => {}));
		const result = expect(
			readContainerFileTail("app", "/log"),
		).rejects.toMatchObject({ code: "READ_TIMEOUT" });
		await vi.advanceTimersByTimeAsync(10000);
		await result;
	});

	it.each([
		0x80000000, 0x08000000, 0x02000000, 0x04000000, 0x01000000, 0x00080000,
	])("rejects non-regular file mode %s before launching tail", async (mode) => {
		mocks.infoArchive.mockResolvedValue(
			Object.assign(Readable.from([]), {
				headers: {
					"x-docker-container-path-stat": Buffer.from(
						JSON.stringify({ mode, size: 0 }),
					).toString("base64"),
				},
			}),
		);
		await expect(readContainerFileTail("app", "/log")).rejects.toMatchObject({
			code: "NOT_A_FILE",
		});
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("fails closed when Docker omits path metadata", async () => {
		mocks.infoArchive.mockResolvedValue(Readable.from([]));
		await expect(readContainerFileTail("app", "/log")).rejects.toMatchObject({
			code: "READ_FAILED",
		});
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("bounds path inspection by the same read deadline", async () => {
		vi.useFakeTimers();
		mocks.infoArchive.mockReturnValue(new Promise(() => {}));
		const result = expect(
			readContainerFileTail("app", "/log"),
		).rejects.toMatchObject({ code: "READ_TIMEOUT" });
		await vi.advanceTimersByTimeAsync(10000);
		await result;
		expect(mocks.exec).not.toHaveBeenCalled();
	});
});
