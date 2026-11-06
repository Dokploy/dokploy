import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

const state = vi.hoisted(() => ({
	source: null as null | {
		stdout: import("node:stream").PassThrough;
		kill: () => boolean;
	},
}));

vi.mock("node:child_process", async () => {
	const { EventEmitter } = await import("node:events");
	const { PassThrough } = await import("node:stream");

	return {
		spawn: vi.fn((_shell: string, args: string[]) => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new PassThrough(),
				stdout: new PassThrough(),
				stderr: new PassThrough(),
				kill: vi.fn(() => true),
			});

			if (args[1] === "echo boom >&2; exit 3") {
				child.stdin.end();
				child.stdin.emit("close");
				child.stderr.once("end", () => child.emit("close", 3));
				queueMicrotask(() => {
					child.stderr.end("boom\n");
					child.stdout.end();
				});
			} else {
				state.source = child;
				child.stdout.once("end", () => child.emit("close", 0));
				if (args[1] !== "source never finishes") {
					queueMicrotask(() => {
						child.stdout.end("x");
						child.stderr.end();
					});
				}
			}
			return child;
		}),
	};
});

import { pipeBetweenServers } from "@dokploy/server/utils/process/remoteStream";

describe("pipeBetweenServers early target failure", () => {
	it("drains the source and rejects if target stdin closed before piping", async () => {
		await expect(
			pipeBetweenServers({
				source: { serverId: null, command: "printf x" },
				target: { serverId: null, command: "echo boom >&2; exit 3" },
			}),
		).rejects.toThrow("target exited with code 3: boom");

		await vi.waitFor(() => {
			expect(state.source?.stdout.readableEnded).toBe(true);
		});
		expect(state.source?.kill).toHaveBeenCalledOnce();
	}, 1_000);
	it("rejects promptly even if the failed target leaves the source open", async () => {
		await expect(
			pipeBetweenServers({
				source: { serverId: null, command: "source never finishes" },
				target: { serverId: null, command: "echo boom >&2; exit 3" },
			}),
		).rejects.toThrow("target exited with code 3: boom");

		expect(state.source?.kill).toHaveBeenCalledOnce();
	}, 1_000);
});
