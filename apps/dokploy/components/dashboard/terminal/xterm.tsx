import { ClipboardAddon } from "@xterm/addon-clipboard";
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
import { fixMacOsAltKeys } from "@/lib/terminal-keyboard";
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
	const searchInputRef = useRef<HTMLInputElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		if (isSearchOpen) {
			searchInputRef.current?.focus();
		}
	}, [isSearchOpen]);

	useEffect(() => {
		const root = rootRef.current;
		const mount = mountRef.current;
		if (!root || !mount) {
			return;
		}

		let dispose: (() => void) | undefined;
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
			terminal.loadAddon(new ClipboardAddon());
			terminal.unicode.activeVersion = "11";
			terminal.open(mount);
			fitAddon.fit();

			let disposed = false;

			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const params = new URLSearchParams(query);
			params.set("cols", terminal.cols.toString());
			params.set("rows", terminal.rows.toString());
			const socket = new WebSocket(
				`${protocol}//${window.location.host}${path}?${params.toString()}`,
			);
			socket.binaryType = "arraybuffer";

			const encoder = new TextEncoder();
			const dataDisposable = terminal.onData((data) => {
				if (socket.readyState === WebSocket.OPEN) {
					socket.send(encoder.encode(data));
				}
			});
			socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
				terminal.write(
					typeof event.data === "string"
						? event.data
						: new Uint8Array(event.data),
				);
			};

			let resizeFrame: number | undefined;
			const fitAndResize = () => {
				if (resizeFrame !== undefined) {
					return;
				}

				resizeFrame = window.requestAnimationFrame(() => {
					resizeFrame = undefined;
					if (disposed) {
						return;
					}

					fitAddon.fit();
					if (socket.readyState === WebSocket.OPEN) {
						socket.send(
							JSON.stringify({
								type: "resize",
								cols: terminal.cols,
								rows: terminal.rows,
							}),
						);
					}
				});
			};
			const resizeObserver = new ResizeObserver(fitAndResize);
			resizeObserver.observe(root);
			socket.addEventListener("open", fitAndResize);

			fixMacOsAltKeys(terminal, (event) => {
				if (
					event.type === "keydown" &&
					(event.ctrlKey || event.metaKey) &&
					event.key.toLowerCase() === "f"
				) {
					event.preventDefault();
					setIsSearchOpen(true);
					return false;
				}
				return true;
			});

			const selectionDisposable = terminal.onSelectionChange(() => {
				const selection = terminal.getSelection();
				if (selection && navigator.clipboard) {
					void navigator.clipboard.writeText(selection).catch(() => undefined);
				}
			});
			const handleContextMenu = (event: MouseEvent) => {
				event.preventDefault();
				if (navigator.clipboard) {
					void navigator.clipboard
						.readText()
						.then((text) => terminal.paste(text))
						.catch(() => undefined);
				}
			};
			mount.addEventListener("contextmenu", handleContextMenu);

			dispose = () => {
				disposed = true;
				resizeObserver.disconnect();
				socket.removeEventListener("open", fitAndResize);
				mount.removeEventListener("contextmenu", handleContextMenu);
				dataDisposable.dispose();
				selectionDisposable.dispose();
				if (resizeFrame !== undefined) {
					window.cancelAnimationFrame(resizeFrame);
				}
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
						ref={searchInputRef}
						aria-label="Search terminal output"
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
