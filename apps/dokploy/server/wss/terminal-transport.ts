import { Buffer } from "node:buffer";
import type { RawData } from "ws";

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
