import type { Terminal } from "@xterm/xterm";

// The clipboard API only exists on a secure context, and a large share of
// Dokploy instances are reached over plain HTTP on an IP before a domain is
// set up. Those are exactly the installs where copying matters most, so the
// old execCommand path stays as a fallback rather than letting the copy fail
// silently.
const writeWithExecCommand = (text: string, host: HTMLElement): boolean => {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";

	// Appended next to the terminal rather than to the body: both terminals
	// open inside a modal dialog, whose focus trap pulls the focus straight
	// back out of anything placed outside it, dropping the very selection
	// execCommand is about to read.
	host.appendChild(textarea);

	// Selecting the textarea takes the focus away from the terminal, and
	// without giving it back the next keystroke would go nowhere.
	const previouslyFocused = document.activeElement;
	textarea.select();

	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		textarea.remove();
		if (previouslyFocused instanceof HTMLElement) {
			previouslyFocused.focus();
		}
	}
};

export const writeToClipboard = async (
	text: string,
	/** Where the fallback puts its textarea, so a focus trap cannot reject it. */
	host: HTMLElement,
): Promise<boolean> => {
	if (window.isSecureContext && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Permission denied or no transient activation: the fallback below
			// still works, because it copies from a real selection.
		}
	}

	return writeWithExecCommand(text, host);
};

/**
 * Copies whatever was selected with the mouse, the way a Unix terminal has
 * done since X11's primary selection.
 *
 * No keyboard shortcut: `Ctrl+C` has to keep sending SIGINT, and the usual
 * second choice, `Ctrl+Shift+C`, is reserved by browsers for DevTools and
 * never reaches the page.
 *
 * The selection is left alone afterwards: a copy that erases what you just
 * highlighted gives no way to tell it apart from a copy that did nothing.
 */
export const attachSelectionCopy = (
	term: Terminal,
	element: HTMLElement,
	onCopied?: () => void,
): (() => void) => {
	let draggingFromTerminal = false;
	let pending: ReturnType<typeof setTimeout> | null = null;

	const copySelection = () => {
		pending = null;

		if (!term.hasSelection()) {
			return;
		}

		const selection = term.getSelection();
		if (!selection.trim()) {
			return;
		}

		void writeToClipboard(selection, element).then((copied) => {
			if (copied) {
				onCopied?.();
			}
		});
	};

	const startDrag = () => {
		draggingFromTerminal = true;
	};

	/**
	 * Listening on the document rather than on the terminal, because reaching
	 * the end of a line means dragging past its edge, and that release lands
	 * on whatever is next to the terminal.
	 *
	 * Deferred by a tick, because xterm settles the selection in its own
	 * mouseup handler, which it registers on the document when the drag
	 * starts, therefore after this one. Reading the selection straight away
	 * catches it as it was mid-drag. A timeout keeps the transient user
	 * activation the clipboard write needs, which lasts seconds.
	 */
	const endDrag = () => {
		if (!draggingFromTerminal) {
			return;
		}

		draggingFromTerminal = false;
		pending = setTimeout(copySelection, 0);
	};

	element.addEventListener("mousedown", startDrag);
	document.addEventListener("mouseup", endDrag);

	return () => {
		element.removeEventListener("mousedown", startDrag);
		document.removeEventListener("mouseup", endDrag);
		if (pending) {
			clearTimeout(pending);
		}
	};
};
