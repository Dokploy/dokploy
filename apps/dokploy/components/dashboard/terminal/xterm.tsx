import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { type ITheme, Terminal } from "@xterm/xterm";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	attachTerminalKeyHandlers,
	IS_MAC_PLATFORM,
	macOsAltKeyHandler,
} from "@/lib/terminal-keyboard";
import { clampTerminalSize } from "@/lib/terminal-size";
import { buildWsUrl } from "@/lib/ws-url";
import {
	attachTerminalOutput,
	createTerminalResizeSync,
	decodeOsc52ClipboardWrite,
	encodeTerminalBinary,
	encodeTerminalText,
} from "./transport";
import "@xterm/xterm/css/xterm.css";

const LIGHT_ANSI_THEME = {
	black: "#24292f",
	red: "#cf222e",
	green: "#116329",
	yellow: "#4d2d00",
	blue: "#0969da",
	magenta: "#8250df",
	cyan: "#1b7c83",
	white: "#6e7781",
	brightBlack: "#57606a",
	brightRed: "#a40e26",
	brightGreen: "#1a7f37",
	brightYellow: "#633c01",
	brightBlue: "#218bff",
	brightMagenta: "#a475f9",
	brightCyan: "#3192aa",
	brightWhite: "#24292f",
} satisfies ITheme;

const DARK_ANSI_THEME = {
	black: "#484f58",
	red: "#ff7b72",
	green: "#3fb950",
	yellow: "#d29922",
	blue: "#58a6ff",
	magenta: "#bc8cff",
	cyan: "#39c5cf",
	white: "#b1bac4",
	brightBlack: "#6e7681",
	brightRed: "#ffa198",
	brightGreen: "#56d364",
	brightYellow: "#e3b341",
	brightBlue: "#79c0ff",
	brightMagenta: "#d2a8ff",
	brightCyan: "#56d4dd",
	brightWhite: "#f0f6fc",
} satisfies ITheme;

const SEARCH_DECORATIONS = {
	matchOverviewRuler: "#58a6ff",
	activeMatchColorOverviewRuler: "#d29922",
};

const getTerminalTheme = (
	container: HTMLDivElement,
	resolvedTheme?: string,
): ITheme => {
	const styles = window.getComputedStyle(container);
	const isDark =
		resolvedTheme === "dark" ||
		(resolvedTheme === undefined &&
			document.documentElement.classList.contains("dark"));

	return {
		...(isDark ? DARK_ANSI_THEME : LIGHT_ANSI_THEME),
		background: styles.backgroundColor,
		foreground: styles.color,
		cursor: styles.color,
		cursorAccent: styles.backgroundColor,
		selectionBackground: isDark ? "#264f78" : "#add6ff",
		selectionInactiveBackground: isDark ? "#3a3d41" : "#e5ebf1",
	};
};

interface XTermProps {
	path: "/terminal" | "/docker-container-terminal";
	query: string;
}

export const XTerm = ({ path, query }: XTermProps) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		const root = rootRef.current;
		const mount = mountRef.current;
		if (!root || !mount) {
			return;
		}

		let dispose: (() => void) | undefined;
		// React StrictMode immediately cleans up its first development mount.
		// Defer creation so that cleanup can cancel it before xterm calls fit().
		const initializationFrame = window.requestAnimationFrame(() => {
			const terminal = new Terminal({
				allowProposedApi: true,
				convertEol: true,
				cursorBlink: true,
				fontFamily: window.getComputedStyle(root).fontFamily,
				lineHeight: 1.4,
				scrollback: 10_000,
				theme: getTerminalTheme(root),
			});
			const fitAddon = new FitAddon();
			const searchAddon = new SearchAddon();
			const unicodeAddon = new Unicode11Addon();

			terminalRef.current = terminal;
			searchAddonRef.current = searchAddon;
			terminal.loadAddon(fitAddon);
			terminal.loadAddon(searchAddon);
			terminal.loadAddon(unicodeAddon);
			terminal.loadAddon(new WebLinksAddon());
			const clipboardDisposable = terminal.parser.registerOscHandler(
				52,
				(data) => {
					const clipboardText = decodeOsc52ClipboardWrite(data);
					if (clipboardText !== null && navigator.clipboard) {
						void navigator.clipboard
							.writeText(clipboardText)
							.catch(() => undefined);
					}
					return true;
				},
			);
			terminal.unicode.activeVersion = "11";
			terminal.open(mount);

			// Keep the rendered buffer in step with the clamped size the PTY is
			// told about, so wide viewports don't wrap at an invisible column.
			const fitTerminal = () => {
				fitAddon.fit();
				const size = clampTerminalSize({
					cols: terminal.cols,
					rows: terminal.rows,
				});
				if (terminal.cols !== size.cols || terminal.rows !== size.rows) {
					terminal.resize(size.cols, size.rows);
				}
				return size;
			};

			const params = new URLSearchParams(query);
			const initialSize = fitTerminal();
			params.set("cols", initialSize.cols.toString());
			params.set("rows", initialSize.rows.toString());
			const socket = new WebSocket(buildWsUrl(path, params));
			socket.binaryType = "arraybuffer";

			const dataDisposable = terminal.onData((data) => {
				if (socket.readyState === WebSocket.OPEN) {
					socket.send(encodeTerminalText(data));
				}
			});
			const binaryDisposable = terminal.onBinary((data) => {
				if (socket.readyState === WebSocket.OPEN) {
					socket.send(encodeTerminalBinary(data));
				}
			});
			const disposeSocketOutput = attachTerminalOutput(socket, terminal);
			const resizeSync = createTerminalResizeSync(
				socket,
				fitTerminal,
				initialSize,
			);
			const resizeObserver = new ResizeObserver(resizeSync.schedule);
			resizeObserver.observe(root);

			// Plain Ctrl+F must keep reaching the shell (readline forward-char,
			// paging in less/vim), so search binds to Cmd+F on macOS and
			// Ctrl+Shift+F elsewhere. Ctrl+Shift+C copies the selection, since
			// plain Ctrl+C is SIGINT inside a terminal.
			attachTerminalKeyHandlers(terminal, [
				macOsAltKeyHandler(terminal),
				(event) => {
					if (event.type !== "keydown" || event.altKey) {
						return true;
					}
					const key = event.key.toLowerCase();
					const isSearchShortcut =
						key === "f" &&
						((IS_MAC_PLATFORM && event.metaKey && !event.ctrlKey) ||
							(event.ctrlKey && event.shiftKey && !event.metaKey));
					if (isSearchShortcut) {
						event.preventDefault();
						setIsSearchOpen(true);
						return false;
					}
					const isCopyShortcut =
						key === "c" && event.ctrlKey && event.shiftKey && !event.metaKey;
					if (isCopyShortcut && terminal.hasSelection()) {
						event.preventDefault();
						if (navigator.clipboard) {
							void navigator.clipboard
								.writeText(terminal.getSelection())
								.catch(() => undefined);
						}
						return false;
					}
					return true;
				},
			]);

			dispose = () => {
				resizeObserver.disconnect();
				resizeSync.dispose();
				disposeSocketOutput();
				dataDisposable.dispose();
				binaryDisposable.dispose();
				clipboardDisposable.dispose();
				if (socket.readyState < WebSocket.CLOSING) {
					socket.close();
				}
				terminal.dispose();
				if (terminalRef.current === terminal) {
					terminalRef.current = null;
					searchAddonRef.current = null;
				}
			};
		});

		return () => {
			window.cancelAnimationFrame(initializationFrame);
			dispose?.();
		};
	}, [path, query]);

	useEffect(() => {
		const root = rootRef.current;
		const terminal = terminalRef.current;
		if (root && terminal) {
			terminal.options.theme = getTerminalTheme(root, resolvedTheme);
		}
	}, [resolvedTheme]);

	const findNext = () => {
		if (searchTerm) {
			searchAddonRef.current?.findNext(searchTerm, {
				decorations: SEARCH_DECORATIONS,
			});
		}
	};

	const findPrevious = () => {
		if (searchTerm) {
			searchAddonRef.current?.findPrevious(searchTerm, {
				decorations: SEARCH_DECORATIONS,
			});
		}
	};

	const closeSearch = () => {
		setIsSearchOpen(false);
		searchAddonRef.current?.clearDecorations();
		terminalRef.current?.focus();
	};

	return (
		<div
			ref={rootRef}
			className="relative h-full min-h-0 w-full overflow-hidden rounded-lg border bg-background p-2 font-mono text-foreground"
		>
			{isSearchOpen && (
				<div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-md border bg-background p-1 shadow-md">
					<Input
						aria-label="Search terminal output"
						autoFocus
						className="h-8 w-52"
						value={searchTerm}
						onChange={(event) => {
							setSearchTerm(event.currentTarget.value);
							searchAddonRef.current?.findNext(event.currentTarget.value, {
								incremental: true,
								decorations: SEARCH_DECORATIONS,
							});
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.shiftKey ? findPrevious() : findNext();
							} else if (event.key === "Escape") {
								closeSearch();
							}
						}}
					/>
					<Button
						aria-label="Previous match"
						className="size-8"
						onClick={findPrevious}
						size="icon"
						variant="ghost"
					>
						<ChevronUp className="size-4" />
					</Button>
					<Button
						aria-label="Next match"
						className="size-8"
						onClick={findNext}
						size="icon"
						variant="ghost"
					>
						<ChevronDown className="size-4" />
					</Button>
					<Button
						aria-label="Close search"
						className="size-8"
						onClick={closeSearch}
						size="icon"
						variant="ghost"
					>
						<X className="size-4" />
					</Button>
				</div>
			)}
			<div ref={mountRef} className="h-full w-full" />
		</div>
	);
};
