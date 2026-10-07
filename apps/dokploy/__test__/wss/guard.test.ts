import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	guardWebSocketHandler,
	onGuardedConnection,
	toCloseReason,
} from "@/server/wss/guard";

/**
 * EventEmitter drops the promise an async `connection` listener returns, so a
 * failure inside one (auth lookup, offline remote server, ...) used to reach
 * the process-wide `unhandledRejection` handler with no context.
 */

const fakeSocket = () => ({ close: vi.fn() });

let unhandled: unknown[];
const onUnhandled = (reason: unknown) => {
	unhandled.push(reason);
};
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	unhandled = [];
	process.on("unhandledRejection", onUnhandled);
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	process.off("unhandledRejection", onUnhandled);
	errorSpy.mockRestore();
});

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("toCloseReason", () => {
	it("leaves a short reason untouched", () => {
		expect(toCloseReason("Error: nope")).toBe("Error: nope");
	});

	it("trims to the 123 bytes a close frame allows, including multibyte text", () => {
		const long = `Error: ${"é".repeat(200)}`;
		const trimmed = toCloseReason(long);
		expect(Buffer.byteLength(trimmed, "utf8")).toBeLessThanOrEqual(123);
		expect(trimmed.startsWith("Error: é")).toBe(true);
	});
});

describe("guardWebSocketHandler", () => {
	it("closes the socket and logs when the handler rejects", async () => {
		const ws = fakeSocket();
		const guarded = guardWebSocketHandler("test", async () => {
			throw new Error(
				"SSH connection error: Timed out while waiting for handshake",
			);
		});

		guarded(ws as never, {} as never);
		await settle();

		expect(unhandled).toEqual([]);
		expect(ws.close).toHaveBeenCalledWith(
			1011,
			"Error: SSH connection error: Timed out while waiting for handshake",
		);
		expect(errorSpy).toHaveBeenCalledWith(
			"[wss:test] connection handler failed:",
			"SSH connection error: Timed out while waiting for handshake",
		);
	});

	it("survives a close that throws and an over-long error message", async () => {
		const close = vi.fn((_code: number, _reason: string) => {
			throw new Error("already closed");
		});
		const ws = { close };
		const guarded = guardWebSocketHandler("test", async () => {
			throw new Error("x".repeat(500));
		});

		guarded(ws as never, {} as never);
		await settle();

		expect(unhandled).toEqual([]);
		const reason = close.mock.calls[0]?.[1] as string;
		expect(Buffer.byteLength(reason, "utf8")).toBeLessThanOrEqual(123);
	});

	it("does not touch the socket when the handler succeeds", async () => {
		const ws = fakeSocket();
		const handler = vi.fn(async () => {});
		guardWebSocketHandler("test", handler)(ws as never, {} as never);
		await settle();
		expect(handler).toHaveBeenCalledTimes(1);
		expect(ws.close).not.toHaveBeenCalled();
	});
});

describe("onGuardedConnection", () => {
	it("registers a guarded listener on the server's connection event", async () => {
		const wss = new EventEmitter();
		onGuardedConnection(wss as never, "test", async () => {
			throw new Error("db down");
		});

		const ws = fakeSocket();
		wss.emit("connection", ws, {});
		await settle();

		expect(unhandled).toEqual([]);
		expect(ws.close).toHaveBeenCalledWith(1011, "Error: db down");
	});
});
