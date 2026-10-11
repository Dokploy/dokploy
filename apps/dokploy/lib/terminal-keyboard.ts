import type { Terminal } from "@xterm/xterm";

export interface TerminalSelectionTarget {
	hasSelection(): boolean;
	getSelection(): string;
	input?(data: string): void;
	paste?(data: string): void;
	focus?(): void;
}

/**
 * Copies text to the system clipboard using the modern Clipboard API
 * with fallback to document.execCommand('copy') for non-secure HTTP contexts.
 */
export const copyToClipboard = async (
	text: string,
	term?: TerminalSelectionTarget,
): Promise<boolean> => {
	if (!text) {
		return false;
	}

	if (
		typeof navigator !== "undefined" &&
		navigator.clipboard?.writeText &&
		(typeof window === "undefined" || window.isSecureContext)
	) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall through to execCommand fallback if writeText rejects
		}
	}

	if (
		typeof document !== "undefined" &&
		typeof document.execCommand === "function"
	) {
		try {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			textarea.style.left = "-9999px";
			textarea.style.top = "-9999px";
			textarea.setAttribute("readonly", "");
			document.body.appendChild(textarea);
			try {
				textarea.focus();
				textarea.select();
				return document.execCommand("copy");
			} finally {
				document.body.removeChild(textarea);
				if (term?.focus) {
					term.focus();
				}
			}
		} catch {
			return false;
		}
	}

	return false;
};

/**
 * Pastes text from the system clipboard into the terminal.
 */
export const pasteFromClipboard = async (
	term: TerminalSelectionTarget,
): Promise<boolean> => {
	if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				if (typeof term.paste === "function") {
					term.paste(text);
				} else if (term.input) {
					term.input(text);
				}
				return true;
			}
		} catch {
			// Clipboard read may be blocked by browser permissions
		}
	}
	return false;
};

/**
 * Checks whether the current environment is running on a Mac platform.
 */
export const isMacPlatform = (): boolean => {
	return (
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPod|iPad/.test(navigator.platform)
	);
};

/**
 * Determines whether a keyboard event matches the copy shortcut on non-Mac platforms:
 * Ctrl+C, Ctrl+Shift+C, or Ctrl+Insert.
 */
export const isCopyEvent = (event: KeyboardEvent): boolean => {
	if (
		event.type !== "keydown" ||
		!event.ctrlKey ||
		event.altKey ||
		event.metaKey
	) {
		return false;
	}
	const isKeyC =
		event.key === "c" || event.key === "C" || event.code === "KeyC";
	const isKeyInsert = event.key === "Insert" || event.code === "Insert";
	return isKeyC || isKeyInsert;
};

/**
 * Checks whether an event is macOS Option/Alt key composed character.
 * Preserves the fix for https://github.com/Dokploy/dokploy/issues/4297.
 */
export const isMacOsAltKeyEvent = (event: KeyboardEvent): boolean => {
	if (!isMacPlatform()) {
		return false;
	}
	return (
		event.type === "keydown" &&
		event.altKey &&
		!event.ctrlKey &&
		!event.metaKey &&
		event.key.length === 1
	);
};

/**
 * Handles terminal keyboard events. Returns false if the event was handled and
 * should be suppressed from default terminal processing, or true to allow
 * default terminal behavior (e.g. sending SIGINT or normal keystroke).
 */
export const handleTerminalKeyDown = (
	event: KeyboardEvent,
	term: TerminalSelectionTarget,
): boolean => {
	// Only handle keydown events; allow keyup/keypress to proceed normally in xterm
	if (event.type !== "keydown") {
		return true;
	}

	// If macOS Cmd key is pressed, let native browser shortcuts (Cmd+C, Cmd+V, Cmd+A) proceed untouched
	if (event.metaKey) {
		return true;
	}

	// On macOS, Ctrl+C must always pass through to xterm to send SIGINT (\x03).
	// Mac users copy with Cmd+C, never Ctrl+C.
	if (
		isMacPlatform() &&
		event.ctrlKey &&
		!event.shiftKey &&
		(event.key === "c" || event.key === "C" || event.code === "KeyC")
	) {
		return true;
	}

	// Handle Shift+Insert for paste on Windows/Linux
	if (
		event.shiftKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.metaKey &&
		(event.key === "Insert" || event.code === "Insert")
	) {
		if (!event.repeat) {
			void pasteFromClipboard(term);
		}
		event.preventDefault();
		return false;
	}

	// Handle Ctrl+C, Ctrl+Shift+C, and Ctrl+Insert for Linux/Windows
	if (isCopyEvent(event)) {
		if (term.hasSelection()) {
			// Suppress repeated clipboard writes during key-repeat
			if (!event.repeat) {
				const selectedText = term.getSelection();
				if (selectedText) {
					void copyToClipboard(selectedText, term);
				}
			}
			event.preventDefault();
			return false;
		}

		// Prevent browser DevTools from opening on Ctrl+Shift+C when nothing is selected
		if (event.shiftKey) {
			event.preventDefault();
			return false;
		}

		// If no selection on Ctrl+C or Ctrl+Insert, allow event to propagate (e.g. Ctrl+C sends SIGINT to shell)
		return true;
	}

	// Preserve macOS Option/Alt key handling for German/international layouts
	if (isMacOsAltKeyEvent(event)) {
		event.preventDefault();
		term.input?.(event.key);
		return false;
	}

	// Allow normal key typing, enter, tab, arrow keys, backspace, etc.
	return true;
};

/**
 * Registers custom key event handler on an xterm Terminal instance.
 * Replaces and supersedes fixMacOsAltKeys while remaining backward-compatible.
 */
export const setupTerminalKeyboard = (term: Terminal): void => {
	term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
		return handleTerminalKeyDown(event, term);
	});
};

export const attachTerminalKeyboardHandlers = setupTerminalKeyboard;
export const handleTerminalKeyboard = setupTerminalKeyboard;

// Backwards-compatible alias for existing imports in docker-terminal and settings terminal
export const fixMacOsAltKeys = setupTerminalKeyboard;
