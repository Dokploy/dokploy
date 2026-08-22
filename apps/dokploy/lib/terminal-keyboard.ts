import type { Terminal } from "@xterm/xterm";

export const IS_MAC_PLATFORM =
	typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

/** Return false to consume the event, true to let the next handler run. */
export type TerminalKeyHandler = (event: KeyboardEvent) => boolean;

// xterm allows only one attachCustomKeyEventHandler, so all keyboard
// customizations register through this composer.
export const attachTerminalKeyHandlers = (
	term: Terminal,
	handlers: TerminalKeyHandler[],
) => {
	term.attachCustomKeyEventHandler((event) => {
		for (const handler of handlers) {
			if (!handler(event)) {
				return false;
			}
		}
		return true;
	});
};

// xterm's platform detection mistakes the bundled Next.js `process` polyfill
// for Node.js, so it never treats Option/Alt as third-level shift on macOS and
// swallows composed characters like Option+L (@ on German layouts).
// https://github.com/Dokploy/dokploy/issues/4297
export const macOsAltKeyHandler =
	(term: Terminal): TerminalKeyHandler =>
	(event) => {
		if (
			IS_MAC_PLATFORM &&
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
	};
