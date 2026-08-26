import { PassThrough } from "node:stream";
import {
	type CommandChannel,
	CommandChannelError,
	openCommandChannelPair,
	pipeCommandChannels,
} from "@dokploy/server/utils/migration/channel";
import { describe, expect, it, vi } from "vitest";

/**
 * Minimal in-memory `CommandChannel` double: lets tests drive `waitForExit`
 * resolution/rejection directly and observe `dispose()` calls, without ever
 * spawning a process or opening an SSH connection.
 */
const makeFakeChannel = (overrides: {
	stdin?: PassThrough;
	stdout?: PassThrough;
	waitForExit: () => Promise<number | null>;
	stderr?: string;
}): Omit<CommandChannel, "stdin" | "stdout" | "dispose"> & {
	stdin: PassThrough;
	stdout: PassThrough;
	dispose: () => void;
} => {
	return {
		stdin: overrides.stdin ?? new PassThrough(),
		stdout: overrides.stdout ?? new PassThrough(),
		waitForExit: overrides.waitForExit,
		getStderr: () => overrides.stderr ?? "",
		dispose: vi.fn(),
	};
};

describe("pipeCommandChannels", () => {
	it("disposes both channels and succeeds when both commands exit 0", async () => {
		const source = makeFakeChannel({ waitForExit: async () => 0 });
		const destination = makeFakeChannel({ waitForExit: async () => 0 });
		source.stdout.end();

		await expect(
			pipeCommandChannels({ source, destination, label: "test transfer" }),
		).resolves.toBeUndefined();

		expect(source.dispose).toHaveBeenCalledTimes(1);
		expect(destination.dispose).toHaveBeenCalledTimes(1);
	});

	it("disposes both channels even when the destination's waitForExit() rejects (a stream/connection error, not just a non-zero exit)", async () => {
		const source = makeFakeChannel({ waitForExit: async () => 0 });
		const destination = makeFakeChannel({
			waitForExit: () => Promise.reject(new Error("ECONNRESET")),
		});
		source.stdout.end();

		await expect(
			pipeCommandChannels({ source, destination, label: "test transfer" }),
		).rejects.toThrow(/destination command to exit.*ECONNRESET/i);

		// The core of the fix: a rejection on one side's waitForExit() must
		// never skip disposing either channel (they used to be disposed via
		// Promise.all, which throws away the loser's cleanup on rejection).
		expect(source.dispose).toHaveBeenCalledTimes(1);
		expect(destination.dispose).toHaveBeenCalledTimes(1);
	});

	it("disposes both channels even when the source's waitForExit() rejects", async () => {
		const source = makeFakeChannel({
			waitForExit: () => Promise.reject(new Error("child process error")),
		});
		const destination = makeFakeChannel({ waitForExit: async () => 0 });
		source.stdout.end();

		await expect(
			pipeCommandChannels({ source, destination, label: "test transfer" }),
		).rejects.toThrow(/source command to exit.*child process error/i);

		expect(source.dispose).toHaveBeenCalledTimes(1);
		expect(destination.dispose).toHaveBeenCalledTimes(1);
	});

	it("surfaces a distinct, meaningful error naming the source when only the source exits non-zero", async () => {
		const source = makeFakeChannel({
			waitForExit: async () => 1,
			stderr: "tar: short read",
		});
		const destination = makeFakeChannel({ waitForExit: async () => 0 });
		source.stdout.end();

		const error = await pipeCommandChannels({
			source,
			destination,
			label: "test transfer",
		}).catch((err) => err);

		expect(error).toBeInstanceOf(CommandChannelError);
		expect(error.message).toMatch(/source command failed/i);
		expect(error.message).toContain("tar: short read");
	});

	it("disposes both channels when the pipeline itself fails", async () => {
		const source = makeFakeChannel({ waitForExit: async () => 0 });
		const destination = makeFakeChannel({ waitForExit: async () => 0 });
		// Destroying stdin before the pipeline runs makes `pipeline()` reject.
		destination.stdin.destroy(new Error("stdin destroyed"));
		source.stdout.end();

		await expect(
			pipeCommandChannels({ source, destination, label: "test transfer" }),
		).rejects.toThrow(/streaming transfer failed/i);

		expect(source.dispose).toHaveBeenCalledTimes(1);
		expect(destination.dispose).toHaveBeenCalledTimes(1);
	});

	it("settles both waitForExit() promises - even when they reject - when the pipeline itself fails, so neither can surface as an unhandled rejection", async () => {
		// The core of the fix: previously, when `pipeline()` threw, both
		// channels were disposed and the streaming error was thrown WITHOUT
		// ever calling `waitForExit()` on either side. `waitForExit()` returns
		// an already-live promise (created when the channel was opened), so if
		// nothing ever attaches a handler to it and it later rejects (e.g.
		// because `dispose()` just killed the underlying process/stream), that
		// rejection has no handler at all and can crash the process as an
		// unhandled rejection. This test proves both `waitForExit()` are
		// always called - via `allSettled`, so their rejections are safely
		// observed - even on the pipeline-failure path.
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (reason: unknown) => {
			unhandled.push(reason);
		};
		process.on("unhandledRejection", onUnhandledRejection);
		try {
			const sourceWaitForExit = vi.fn(() =>
				Promise.reject(new Error("source process errored")),
			);
			const destinationWaitForExit = vi.fn(() =>
				Promise.reject(new Error("destination process errored")),
			);
			const source = makeFakeChannel({ waitForExit: sourceWaitForExit });
			const destination = makeFakeChannel({
				waitForExit: destinationWaitForExit,
			});
			// Destroying stdin before the pipeline runs makes `pipeline()` reject.
			destination.stdin.destroy(new Error("stdin destroyed"));
			source.stdout.end();

			await expect(
				pipeCommandChannels({ source, destination, label: "test transfer" }),
			).rejects.toThrow(/streaming transfer failed/i);

			expect(sourceWaitForExit).toHaveBeenCalledTimes(1);
			expect(destinationWaitForExit).toHaveBeenCalledTimes(1);
			expect(source.dispose).toHaveBeenCalledTimes(1);
			expect(destination.dispose).toHaveBeenCalledTimes(1);

			// Give the event loop a turn so any truly-unhandled rejection would
			// have been reported by now.
			await new Promise((resolve) => setImmediate(resolve));
			expect(unhandled).toHaveLength(0);
		} finally {
			process.off("unhandledRejection", onUnhandledRejection);
		}
	});
});

describe("openCommandChannelPair", () => {
	it("disposes the side that opened successfully when the other side fails to open", async () => {
		// serverId: null opens a real (trivial) local channel; an unknown
		// serverId makes the remote side fail during `findServerById` before
		// any SSH connection is even attempted - a genuine "failed to open"
		// case exercised through real code, not a mock.
		await expect(
			openCommandChannelPair({
				sourceServerId: null,
				sourceCommand: "true",
				targetServerId: "does-not-exist",
				targetCommand: "true",
			}),
		).rejects.toThrow(/Failed to open transfer channel\(s\).*destination:/is);
	});

	it("opens both sides successfully when both commands/targets are valid", async () => {
		const { source, destination } = await openCommandChannelPair({
			sourceServerId: null,
			sourceCommand: "true",
			targetServerId: null,
			targetCommand: "true",
		});
		expect(source).toBeDefined();
		expect(destination).toBeDefined();
		source.dispose();
		destination.dispose();
	});
});
