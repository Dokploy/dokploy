import type { Terminal } from "@xterm/xterm";

const writeWithExecCommand = (text: string, host: HTMLElement): boolean => {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";
	host.appendChild(textarea);

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
	host: HTMLElement,
): Promise<boolean> => {
	if (window.isSecureContext && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {}
	}

	return writeWithExecCommand(text, host);
};

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
