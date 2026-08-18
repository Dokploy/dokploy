import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
	attachTerminalOutput,
	decodeOsc52ClipboardWrite,
	encodeTerminalBinary,
	encodeTerminalText,
} from "../../components/dashboard/terminal/transport";
import { writeTerminalBinaryFrame } from "../../server/wss/terminal-transport";

describe("terminal transport", () => {
	it("stops forwarding WebSocket messages after terminal cleanup", () => {
		const socket = new EventTarget();
		const writes: Array<string | Uint8Array> = [];
		const dispose = attachTerminalOutput(socket, {
			write: (data) => writes.push(data),
		});

		socket.dispatchEvent(
			new MessageEvent("message", { data: "connected\r\n" }),
		);
		socket.dispatchEvent(
			new MessageEvent("message", {
				data: Uint8Array.from([0x1b, 0x5b, 0x41]).buffer,
			}),
		);

		dispose();
		socket.dispatchEvent(new MessageEvent("message", { data: "stale" }));

		expect(writes).toEqual([
			"connected\r\n",
			new Uint8Array([0x1b, 0x5b, 0x41]),
		]);
	});

	it("encodes an xterm X10 mouse report without UTF-8 expansion", () => {
		expect(encodeTerminalBinary("\x1b[M \x80\xff")).toEqual(
			new Uint8Array([0x1b, 0x5b, 0x4d, 0x20, 0x80, 0xff]),
		);
	});

	it("preserves bracketed multiline paste through the terminal transport", () => {
		const paste = "\x1b[200~SELECT 'café';\r\nSELECT '東京';\x1b[201~";
		const writes: Buffer[] = [];

		writeTerminalBinaryFrame(
			{
				write: (data) => writes.push(data),
			},
			Buffer.from(encodeTerminalText(paste)),
		);

		expect(Buffer.concat(writes).toString("utf8")).toBe(paste);
	});

	it("forwards an xterm X10 mouse report to the PTY byte-for-byte", () => {
		const frame = Buffer.from([0x1b, 0x5b, 0x4d, 0x20, 0x80, 0xff]);
		const writes: Buffer[] = [];

		writeTerminalBinaryFrame(
			{
				write: (data) => writes.push(data),
			},
			frame,
		);

		expect(writes).toEqual([frame]);
	});

	it("joins fragmented WebSocket frames before forwarding them to the PTY", () => {
		const fragments = [
			Buffer.from([0x1b, 0x5b, 0x4d]),
			Buffer.from([0x20, 0x80, 0xff]),
		];
		const writes: Buffer[] = [];

		writeTerminalBinaryFrame(
			{
				write: (data) => writes.push(data),
			},
			fragments,
		);

		expect(writes).toEqual([Buffer.from([0x1b, 0x5b, 0x4d, 0x20, 0x80, 0xff])]);
	});

	it("forwards ArrayBuffer frames to the PTY without changing their bytes", () => {
		const frame = Uint8Array.from([0x00, 0x7f, 0x80, 0xff]).buffer;
		const writes: Buffer[] = [];

		writeTerminalBinaryFrame(
			{
				write: (data) => writes.push(data),
			},
			frame,
		);

		expect(writes).toEqual([Buffer.from([0x00, 0x7f, 0x80, 0xff])]);
	});

	it("accepts OSC 52 clipboard writes", () => {
		expect(decodeOsc52ClipboardWrite("c;aGVsbG8gd29ybGQ=")).toBe("hello world");
		expect(decodeOsc52ClipboardWrite("c;")).toBe("");
	});

	it("accepts empty and multi-target OSC 52 selections", () => {
		// An empty selection defaults to the clipboard; emitters like yank(1)
		// and tmux pass-through also send combined targets such as "cs0".
		expect(decodeOsc52ClipboardWrite(";aGVsbG8=")).toBe("hello");
		expect(decodeOsc52ClipboardWrite("cs0;aGVsbG8=")).toBe("hello");
		expect(decodeOsc52ClipboardWrite("pc;aGVsbG8=")).toBe("hello");
	});

	it("refuses OSC 52 clipboard reads and unsupported selections", () => {
		expect(decodeOsc52ClipboardWrite("c;?")).toBeNull();
		expect(decodeOsc52ClipboardWrite(";?")).toBeNull();
		expect(decodeOsc52ClipboardWrite("p;aGVsbG8=")).toBeNull();
		expect(decodeOsc52ClipboardWrite("c;not base64")).toBeNull();
	});
});
