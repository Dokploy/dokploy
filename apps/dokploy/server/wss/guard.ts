import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";

// RFC 6455: a close reason is limited to 123 bytes and `ws.close` throws a
// RangeError for anything longer.
const MAX_CLOSE_REASON_BYTES = 123;

/** Trims a close reason to the 123 bytes a WebSocket close frame can carry. */
export const toCloseReason = (reason: string): string => {
	let trimmed = reason;
	while (Buffer.byteLength(trimmed, "utf8") > MAX_CLOSE_REASON_BYTES) {
		trimmed = trimmed.slice(0, -1);
	}
	return trimmed;
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
 * instead.
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
			try {
				ws.close(1011, toCloseReason(`Error: ${message}`));
			} catch {
				// The socket is already closing or closed.
			}
		});
	};
