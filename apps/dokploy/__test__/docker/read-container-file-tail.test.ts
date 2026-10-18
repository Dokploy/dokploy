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

		await readContainerFileTail(
			"my-container",
			"/var/log/app.log",
			-10,
			50,
		);

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
