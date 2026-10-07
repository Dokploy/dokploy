import type { IncomingMessage } from "node:http";
import { reportUnexpectedError } from "@dokploy/server";
import type { WebSocket, WebSocketServer } from "ws";

// RFC 6455: a close reason is limited to 123 bytes and `ws.close` throws a
// RangeError for anything longer.
const MAX_CLOSE_REASON_BYTES = 123;

/**
 * Trims a close reason to the 123 bytes a WebSocket close frame can carry,
 * without cutting a multibyte UTF-8 character in half. Linear in the length of
 * `reason`, however long it is.
 */
export const toCloseReason = (reason: string): string => {
	const bytes = Buffer.from(reason, "utf8");
	if (bytes.length <= MAX_CLOSE_REASON_BYTES) {
		return reason;
	}
	let end = MAX_CLOSE_REASON_BYTES;
	// If the cut lands inside a multibyte sequence, step back over its
	// continuation bytes and then its lead byte, dropping the whole character.
	if (((bytes[end] ?? 0) & 0xc0) === 0x80) {
		while (end > 0 && ((bytes[end - 1] ?? 0) & 0xc0) === 0x80) {
			end--;
		}
		if (end > 0) {
			end--;
		}
	}
	return bytes.subarray(0, end).toString("utf8");
};

/**
 * Registers `handler` as the `connection` listener of `wss`, guarded by
 * {@link guardWebSocketHandler}.
 */
export const onGuardedConnection = (
	wss: WebSocketServer,
	label: string,
	handler: (ws: WebSocket, req: IncomingMessage) => Promise<void>,
): void => {
	wss.on("connection", guardWebSocketHandler(label, handler));
};

/**
 * Wraps an async WebSocket `connection` handler. EventEmitter drops the
 * promise an async listener returns, so a rejection (a failed auth lookup, an
 * offline remote server, ...) would otherwise reach the process-wide
 * `unhandledRejection` handler with no context. Log it and close the socket
 * instead. Environment errors (an offline server) are only logged; anything
 * else is also reported, since it is most likely a bug.
 */
export const guardWebSocketHandler =
	(
		label: string,
		handler: (ws: WebSocket, req: IncomingMessage) => Promise<void>,
	) =>
	(ws: WebSocket, req: IncomingMessage): void => {
		handler(ws, req).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[wss:${label}] connection handler failed:`, message);
			reportUnexpectedError(error, { handler: "wss", label });
			try {
				ws.close(1011, toCloseReason(`Error: ${message}`));
			} catch {
				// The socket is already closing or closed.
			}
		});
	};
