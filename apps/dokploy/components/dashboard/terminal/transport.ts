import type { TerminalSize } from "@/lib/terminal-size";

const MAX_OSC52_PAYLOAD_LENGTH = 1_000_000;
const terminalTextEncoder = new TextEncoder();
const osc52TextDecoder = new TextDecoder("utf-8", { fatal: true });

interface TerminalOutput {
	write: (data: string | Uint8Array) => unknown;
}

type TerminalMessageSource = Pick<
	EventTarget,
	"addEventListener" | "removeEventListener"
>;

export const attachTerminalOutput = (
	source: TerminalMessageSource,
	terminal: TerminalOutput,
): (() => void) => {
	const handleMessage: EventListener = (event) => {
		const { data } = event as MessageEvent<string | ArrayBuffer>;
		terminal.write(typeof data === "string" ? data : new Uint8Array(data));
	};

	source.addEventListener("message", handleMessage);
	return () => source.removeEventListener("message", handleMessage);
};

export const encodeTerminalText = (data: string): Uint8Array<ArrayBuffer> =>
	terminalTextEncoder.encode(data);

export const encodeTerminalBinary = (data: string): Uint8Array<ArrayBuffer> => {
	const bytes = new Uint8Array(data.length);
	for (let index = 0; index < data.length; index++) {
		bytes[index] = data.charCodeAt(index) & 0xff;
	}
	return bytes;
};

// Intentionally replaces @xterm/addon-clipboard: unlike the addon, this
// refuses OSC 52 read requests ("?") and caps the payload size.
export const decodeOsc52ClipboardWrite = (data: string): string | null => {
	const separatorIndex = data.indexOf(";");
	if (separatorIndex === -1) {
		return null;
	}

	// The selection field may be empty (defaults to the clipboard) or list
	// several targets, e.g. "cs0" — accept anything that includes the
	// clipboard, as emitters like yank(1) and tmux pass-through produce.
	const selection = data.slice(0, separatorIndex);
	const payload = data.slice(separatorIndex + 1);
	if (
		(selection !== "" && !selection.includes("c")) ||
		payload === "?" ||
		payload.length > MAX_OSC52_PAYLOAD_LENGTH
	) {
		return null;
	}

	try {
		const binary = globalThis.atob(payload);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++) {
			bytes[index] = binary.charCodeAt(index);
		}
		return osc52TextDecoder.decode(bytes);
	} catch {
		return null;
	}
};

/**
 * Sends `{type:"resize",cols,rows}` frames, coalesced per animation frame
 * and deduplicated against the last sent (or initial URL-provided) size.
 * Also resends on socket open in case the layout changed during connect.
 */
export const createTerminalResizeSync = (
	socket: WebSocket,
	measure: () => TerminalSize | null,
	initialSize: TerminalSize | null = null,
): { schedule: () => void; dispose: () => void } => {
	let lastSentSize = initialSize;
	let frame: number | undefined;

	const schedule = () => {
		if (frame !== undefined) {
			return;
		}
		frame = window.requestAnimationFrame(() => {
			frame = undefined;
			const size = measure();
			if (!size || socket.readyState !== WebSocket.OPEN) {
				return;
			}
			if (
				size.cols === lastSentSize?.cols &&
				size.rows === lastSentSize?.rows
			) {
				return;
			}
			socket.send(JSON.stringify({ type: "resize", ...size }));
			lastSentSize = size;
		});
	};

	socket.addEventListener("open", schedule);

	return {
		schedule,
		dispose: () => {
			socket.removeEventListener("open", schedule);
			if (frame !== undefined) {
				window.cancelAnimationFrame(frame);
			}
		},
	};
};
