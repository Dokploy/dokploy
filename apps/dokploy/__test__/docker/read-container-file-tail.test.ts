import { readContainerFileTail } from "@dokploy/server/services/docker";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("shell-quote", () => ({
	quote: (args: string[]) => args.join(" "),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

describe("readContainerFileTail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("bounds default lines and bytes, returning file content correctly", async () => {
		const sampleText = "line 1\nline 2\nline 3\n";
		const base64 = Buffer.from(sampleText).toString("base64");
		mocks.execAsync.mockResolvedValue({ stdout: base64, stderr: "" });

		const result = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
		);

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		const command = mocks.execAsync.mock.calls[0][0];
		expect(command).toContain("tail -n 200");
		expect(command).toContain("tail -c 65537");
		expect(result).toEqual({
			content: sampleText,
			truncated: false,
		});
	});

	it("clamps line and byte bounds to maximum allowed limits", async () => {
		const sampleText = "latest error entry";
		const base64 = Buffer.from(sampleText).toString("base64");
		mocks.execAsync.mockResolvedValue({ stdout: base64, stderr: "" });

		await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			99999,
			1000000,
		);

		const command = mocks.execAsync.mock.calls[0][0];
		expect(command).toContain("tail -n 5000");
		expect(command).toContain("tail -c 524289");
	});

	it("clamps line and byte bounds to minimum allowed limits", async () => {
		const sampleText = "single log entry";
		const base64 = Buffer.from(sampleText).toString("base64");
		mocks.execAsync.mockResolvedValue({ stdout: base64, stderr: "" });

		await readContainerFileTail("my-container", "/var/log/app.log", -10, 50);

		const command = mocks.execAsync.mock.calls[0][0];
		expect(command).toContain("tail -n 1");
		expect(command).toContain("tail -c 1025");
	});

	it("detects truncated output when content exceeds requested byte limit", async () => {
		const rawContent = "x".repeat(2000);
		const base64 = Buffer.from(rawContent).toString("base64");
		mocks.execAsync.mockResolvedValue({ stdout: base64, stderr: "" });

		const result = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			50,
			1024,
		);

		expect(result.truncated).toBe(true);
		expect(result.content.length).toBe(1024);
	});

	it("executes via execAsyncRemote when serverId is provided", async () => {
		const sampleText = "remote log data";
		const base64 = Buffer.from(sampleText).toString("base64");
		mocks.execAsyncRemote.mockResolvedValue({ stdout: base64, stderr: "" });

		const result = await readContainerFileTail(
			"remote-container",
			"/var/log/syslog",
			100,
			32768,
			"srv-12345",
		);

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"srv-12345",
			expect.stringContaining("remote-container"),
		);
		expect(result).toEqual({
			content: sampleText,
			truncated: false,
		});
	});

	it("skips leading UTF-8 continuation bytes when truncation splits a multi-byte emoji", async () => {
		// 4-byte UTF-8 emoji "🔥" is [0xF0, 0x9F, 0x94, 0xA5]
		// Truncating with maxBytes = 1024:
		// 1) Slicing so that 3 continuation bytes remain at the start
		const text3 = "🔥" + "a".repeat(1021); // 4 + 1021 = 1025 bytes -> tail 1024 has 3 continuation bytes + 1021 'a's
		mocks.execAsync.mockResolvedValue({
			stdout: Buffer.from(text3, "utf-8").toString("base64"),
			stderr: "",
		});

		const result3 = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			100,
			1024,
		);
		expect(result3.truncated).toBe(true);
		expect(result3.content).not.toContain("\uFFFD");
		expect(result3.content).toBe("a".repeat(1021));

		// 2) Slicing so that 1 continuation byte remains at the start
		const text1 = "🔥" + "a".repeat(1023); // 4 + 1023 = 1027 bytes -> tail 1024 has 1 continuation byte + 1023 'a's
		mocks.execAsync.mockResolvedValue({
			stdout: Buffer.from(text1, "utf-8").toString("base64"),
			stderr: "",
		});

		const result1 = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			100,
			1024,
		);
		expect(result1.truncated).toBe(true);
		expect(result1.content).not.toContain("\uFFFD");
		expect(result1.content).toBe("a".repeat(1023));
	});

	it("skips leading UTF-8 continuation bytes when truncation splits a 3-byte CJK character", async () => {
		// 3-byte CJK character "中" is [0xE4, 0xB8, 0xAD]
		// Truncating with maxBytes = 1024:
		// 1) Slicing so that 2 continuation bytes remain at the start
		const text2 = "中" + "x".repeat(1022); // 3 + 1022 = 1025 bytes -> tail 1024 has 2 continuation bytes + 1022 'x's
		mocks.execAsync.mockResolvedValue({
			stdout: Buffer.from(text2, "utf-8").toString("base64"),
			stderr: "",
		});

		const result2 = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			100,
			1024,
		);
		expect(result2.truncated).toBe(true);
		expect(result2.content).not.toContain("\uFFFD");
		expect(result2.content).toBe("x".repeat(1022));

		// 2) Slicing so that 1 continuation byte remains at the start
		const text1 = "中" + "x".repeat(1023); // 3 + 1023 = 1026 bytes -> tail 1024 has 1 continuation byte + 1023 'x's
		mocks.execAsync.mockResolvedValue({
			stdout: Buffer.from(text1, "utf-8").toString("base64"),
			stderr: "",
		});

		const result1 = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			100,
			1024,
		);
		expect(result1.truncated).toBe(true);
		expect(result1.content).not.toContain("\uFFFD");
		expect(result1.content).toBe("x".repeat(1023));
	});

	it("preserves subsequent CJK and emoji characters intact after stripping split boundary bytes", async () => {
		// "🌟" (4 bytes) + "日本語ログ🚀" (3+3+3+3+4 = 16 bytes)
		// text = "🌟" + "a".repeat(1005) + "日本語ログ🚀" -> 4 + 1005 + 16 = 1025 bytes
		// tail 1024 has 3 continuation bytes of 🌟, followed by 1005 'a's, followed by "日本語ログ🚀"
		const text = "🌟" + "a".repeat(1005) + "日本語ログ🚀";
		const base64 = Buffer.from(text, "utf-8").toString("base64");
		mocks.execAsync.mockResolvedValue({ stdout: base64, stderr: "" });

		const result = await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			100,
			1024,
		);

		expect(result.truncated).toBe(true);
		expect(result.content).not.toContain("\uFFFD");
		expect(result.content).toBe("a".repeat(1005) + "日本語ログ🚀");
	});

	it("throws an error when container has no shell utilities", async () => {
		mocks.execAsync.mockResolvedValue({
			stdout: "",
			stderr: "executable file not found in $PATH",
		});

		await expect(
			readContainerFileTail("minimal-container", "/var/log/app.log"),
		).rejects.toThrow("This container image has no shell utilities");
	});
});
