import { Duplex, PassThrough } from "node:stream";
import {
	execAsyncRemote,
	execAsyncStream,
} from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remoteExec: vi.fn(), end: vi.fn() }));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(async () => ({ sshKeyId: "test-key" })),
}));
vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		Client: class extends EventEmitter {
			exec = mocks.remoteExec;
			end = mocks.end;
			connect() {
				queueMicrotask(() => this.emit("ready"));
				return this;
			}
		},
	};
});

describe("remote process output stream labels", () => {
	let remoteInput: string;
	let remoteStream: Duplex & { stderr: PassThrough };
	beforeEach(() => {
		vi.clearAllMocks();
		remoteInput = "";
		mocks.remoteExec.mockImplementation((_command, callback) => {
			remoteStream = Object.assign(
				new Duplex({
					read() {},
					write(chunk, _encoding, done) {
						remoteInput += chunk.toString();
						done();
					},
				}),
				{ stderr: new PassThrough() },
			);
			callback(null, remoteStream);
			queueMicrotask(() => {
				remoteStream.emit("data", "output");
				remoteStream.stderr.write("warning");
				remoteStream.emit("close", 0);
			});
		});
	});
	it("labels remote output streams only when requested", async () => {
		const onData = vi.fn();
		await expect(
			execAsyncRemote("test-server", "cat", onData, "synthetic-input\n", {
				includeStream: true,
			}),
		).resolves.toEqual({ stdout: "output", stderr: "warning" });
		expect(onData.mock.calls).toEqual([
			["output", "stdout"],
			["warning", "stderr"],
		]);
		expect(remoteInput).toBe("synthetic-input\n");
		expect(remoteStream.writableEnded).toBe(true);
		expect(mocks.end).toHaveBeenCalledOnce();
	});
	it("preserves the existing single-argument remote callback by default", async () => {
		const onData = vi.fn();
		await execAsyncRemote("test-server", "echo hello", onData);
		expect(onData.mock.calls).toEqual([["output"], ["warning"]]);
		expect(remoteStream.writableEnded).toBe(false);
	});
});

describe.skipIf(process.platform === "win32")(
	"process output stream labels",
	() => {
		it("identifies stdout and stderr for independent streaming redaction", async () => {
			const onData = vi.fn();
			const result = await execAsyncStream(
				"printf 'output'; printf 'diagnostic' >&2",
				onData,
				{ includeStream: true },
			);
			expect(onData).toHaveBeenCalledWith("output", "stdout");
			expect(onData).toHaveBeenCalledWith("diagnostic", "stderr");
			expect(result).toEqual({ stdout: "output", stderr: "diagnostic" });
		});
		it("preserves the existing single-argument output callback by default", async () => {
			const onData = vi.fn();
			await execAsyncStream("printf 'output'", onData);
			expect(onData.mock.calls).toEqual([["output"]]);
		});
	},
);
