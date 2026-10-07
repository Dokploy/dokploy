import { EventEmitter } from "node:events";
import { setBackgroundErrorReporter } from "@dokploy/server/utils/process/background";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	guardWebSocketHandler,
	onGuardedConnection,
	toCloseReason,
} from "@/server/wss/guard";

// guard.ts imports the helpers from the @dokploy/server barrel, like the other
// wss files; the real barrel pulls in the whole server (database, native
// modules), so stand in only the module under test.
vi.mock(
	"@dokploy/server",
	() => import("@dokploy/server/utils/process/background"),
);

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

	it("keeps a reason of exactly 123 bytes", () => {
		const exact = "a".repeat(123);
		expect(toCloseReason(exact)).toBe(exact);
	});

	it("trims plain text to 123 bytes", () => {
		expect(toCloseReason("a".repeat(500))).toBe("a".repeat(123));
	});

	it("trims to the 123 bytes a close frame allows, including multibyte text", () => {
		const long = `Error: ${"é".repeat(200)}`;
		const trimmed = toCloseReason(long);
		expect(Buffer.byteLength(trimmed, "utf8")).toBeLessThanOrEqual(123);
		expect(trimmed.startsWith("Error: é")).toBe(true);
		// Never a replacement character from a split sequence.
		expect(trimmed).not.toContain("�");
	});

	it("drops a 4-byte emoji that straddles the boundary instead of splitting it", () => {
		// Every offset of the emoji relative to the 123-byte limit.
		for (let prefix = 115; prefix <= 123; prefix++) {
			const reason = `${"a".repeat(prefix)}😀${"b".repeat(50)}`;
			const trimmed = toCloseReason(reason);
			expect(Buffer.byteLength(trimmed, "utf8")).toBeLessThanOrEqual(123);
			expect(trimmed).not.toContain("�");
			if (prefix + 4 <= 123) {
				expect(trimmed).toBe(
					`${"a".repeat(prefix)}😀${"b".repeat(123 - prefix - 4)}`,
				);
			} else {
				expect(trimmed).toBe("a".repeat(prefix));
			}
		}
	});

	it("keeps a multibyte character that ends exactly at the limit", () => {
		const reason = `${"a".repeat(121)}é${"b".repeat(10)}`;
		expect(toCloseReason(reason)).toBe(`${"a".repeat(121)}é`);
	});

	it("handles a 1 MB reason quickly", () => {
		const huge = "😀".repeat(262_144); // 1 MiB of UTF-8
		const start = performance.now();
		const trimmed = toCloseReason(huge);
		const elapsed = performance.now() - start;
		expect(Buffer.byteLength(trimmed, "utf8")).toBeLessThanOrEqual(123);
		expect(trimmed).toBe("😀".repeat(30));
		expect(elapsed).toBeLessThan(250);
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

describe("reporting of unexpected errors", () => {
	const reporter = vi.fn();

	beforeEach(() => {
		reporter.mockReset();
		setBackgroundErrorReporter(reporter);
	});

	afterEach(() => {
		setBackgroundErrorReporter(undefined);
	});

	it("does not report an offline server (environment error)", async () => {
		const ws = fakeSocket();
		guardWebSocketHandler("test", async () => {
			throw new ExecError(
				"SSH connection error: Timed out while waiting for handshake",
				{ command: "docker stats", serverId: "srv-1" },
			);
		})(ws as never, {} as never);
		await settle();

		expect(reporter).not.toHaveBeenCalled();
		expect(ws.close).toHaveBeenCalledTimes(1);
	});

	it("does not report a network error code", async () => {
		const ws = fakeSocket();
		guardWebSocketHandler("test", async () => {
			throw Object.assign(new Error("connect EHOSTUNREACH 10.0.0.2:22"), {
				code: "EHOSTUNREACH",
			});
		})(ws as never, {} as never);
		await settle();

		expect(reporter).not.toHaveBeenCalled();
	});

	it("reports a programmer error with the wss tag, and still closes the socket", async () => {
		const ws = fakeSocket();
		const bug = new TypeError("Cannot read properties of undefined");
		guardWebSocketHandler("test", async () => {
			throw bug;
		})(ws as never, {} as never);
		await settle();

		expect(reporter).toHaveBeenCalledWith(bug, {
			handler: "wss",
			label: "test",
		});
		expect(ws.close).toHaveBeenCalledWith(
			1011,
			"Error: Cannot read properties of undefined",
		);
	});
});
