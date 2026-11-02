import type { Terminal } from "@xterm/xterm";

// xterm's platform detection mistakes the bundled Next.js `process` polyfill
// for Node.js, so it never treats Option/Alt as third-level shift on macOS and
// swallows composed characters like Option+L (@ on German layouts).
// https://github.com/Dokploy/dokploy/issues/4297
export const fixMacOsAltKeys = (term: Terminal) => {
	if (!/Mac/.test(navigator.platform)) {
		return;
	}
	term.attachCustomKeyEventHandler((event) => {
		if (
			event.type === "keydown" &&
			event.altKey &&
			!event.ctrlKey &&
			!event.metaKey &&
			event.key.length === 1
		) {
			event.preventDefault();
			term.input(event.key);
			return false;
		}
		return true;
	});
};
