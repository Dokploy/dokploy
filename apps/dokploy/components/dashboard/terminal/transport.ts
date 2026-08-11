const MAX_OSC52_PAYLOAD_LENGTH = 1_000_000;

export const encodeTerminalBinary = (data: string): Uint8Array =>
	Uint8Array.from(data, (character) => character.charCodeAt(0) & 0xff);

export const decodeOsc52ClipboardWrite = (data: string): string | null => {
	const separatorIndex = data.indexOf(";");
	if (separatorIndex === -1) {
		return null;
	}

	const selection = data.slice(0, separatorIndex);
	const payload = data.slice(separatorIndex + 1);
	if (
		selection !== "c" ||
		payload === "?" ||
		payload.length > MAX_OSC52_PAYLOAD_LENGTH
	) {
		return null;
	}

	try {
		const binary = globalThis.atob(payload);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
};
