import { Buffer } from "node:buffer";
import type { RawData, WebSocket } from "ws";
import type { TerminalSize } from "../../lib/terminal-size";
import { getErrorMessage, parseTerminalResize } from "./utils";

interface BinaryTerminal {
	write: (data: Buffer) => unknown;
}

const normalizeTerminalBinaryFrame = (frame: RawData): Buffer => {
	if (Buffer.isBuffer(frame)) {
		return frame;
	}

	if (frame instanceof ArrayBuffer) {
		return Buffer.from(frame);
	}

	return Buffer.concat(frame);
};

export const writeTerminalBinaryFrame = (
	terminal: BinaryTerminal,
	frame: RawData,
): void => {
	terminal.write(normalizeTerminalBinaryFrame(frame));
};

interface ResizableTerminal {
	resize(cols: number, rows: number): void;
}

export const tryResizeTerminal = (
	terminal: ResizableTerminal,
	size: TerminalSize,
): boolean => {
	try {
		terminal.resize(size.cols, size.rows);
		return true;
	} catch {
		return false;
	}
};

export interface TerminalInputTarget {
	write: (data: string) => void;
	writeBinary: (frame: RawData) => void;
	resize: (size: TerminalSize) => void;
}

interface SshTerminalStream {
	write(data: Buffer | string): unknown;
	setWindow(rows: number, cols: number, height: number, width: number): void;
}

export const sshTerminalTarget = (
	stream: SshTerminalStream,
): TerminalInputTarget => ({
	write: (data) => stream.write(data),
	writeBinary: (frame) => writeTerminalBinaryFrame(stream, frame),
	resize: ({ cols, rows }) => stream.setWindow(rows, cols, 0, 0),
});

export const attachTerminalInput = (
	ws: WebSocket,
	target: TerminalInputTarget,
): void => {
	ws.on("message", (message, isBinary) => {
		try {
			if (isBinary) {
				target.writeBinary(message);
				return;
			}
			const text = message.toString();
			const size = parseTerminalResize(text);
			if (size) {
				target.resize(size);
			} else {
				target.write(text);
			}
		} catch (error) {
			if (ws.readyState === ws.OPEN) {
				ws.send(getErrorMessage(error));
			}
		}
	});
};

/** For sockets that accept only resize control frames, never input. */
export const attachTerminalResize = (
	ws: WebSocket,
	resize: (size: TerminalSize) => void,
): void => {
	ws.on("message", (message, isBinary) => {
		if (isBinary) return;
		const size = parseTerminalResize(message.toString());
		if (size) {
			resize(size);
		}
	});
};

interface ManagedPty {
	kill(): void;
	write(data: string | Buffer): void;
	resize(cols: number, rows: number): void;
	onExit(listener: () => void): { dispose: () => void };
}

/**
 * Ties a PTY's lifetime to the WebSocket's and returns an input target
 * that no-ops once the PTY has exited, so callers need no exit guards.
 */
export const bindPtyLifecycle = (
	ws: WebSocket,
	pty: ManagedPty,
	onCleanup?: () => void,
): TerminalInputTarget => {
	let exited = false;
	const exitDisposable = pty.onExit(() => {
		exited = true;
		onCleanup?.();
		if (ws.readyState === ws.OPEN) {
			ws.close();
		}
	});
	ws.on("close", () => {
		onCleanup?.();
		exitDisposable.dispose();
		if (!exited) {
			try {
				pty.kill();
			} catch {
				// The PTY may have exited before its exit callback ran.
			}
		}
	});
	return {
		write: (data) => {
			if (!exited) {
				pty.write(data);
			}
		},
		writeBinary: (frame) => {
			if (!exited) {
				writeTerminalBinaryFrame(pty, frame);
			}
		},
		resize: (size) => {
			if (!exited && !tryResizeTerminal(pty, size)) {
				ws.close();
			}
		},
	};
};
