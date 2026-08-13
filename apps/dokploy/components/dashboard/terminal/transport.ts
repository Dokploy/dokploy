const MAX_OSC52_PAYLOAD_LENGTH = 1_000_000;

export const encodeTerminalBinary = (data: string): Uint8Array<ArrayBuffer> => {
	const bytes = new Uint8Array(data.length);
	for (let index = 0; index < data.length; index++) {
		bytes[index] = data.charCodeAt(index) & 0xff;
	}
	return bytes;
};

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
