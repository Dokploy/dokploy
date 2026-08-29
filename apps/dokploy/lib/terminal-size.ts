// Shared between the browser terminals and the wss handlers so the client
// never reports dimensions the server would refuse.
export const DEFAULT_TERMINAL_COLS = 80;
export const DEFAULT_TERMINAL_ROWS = 24;
export const MAX_TERMINAL_COLS = 500;
export const MAX_TERMINAL_ROWS = 200;

export interface TerminalSize {
	cols: number;
	rows: number;
}

export const clampTerminalSize = (size: TerminalSize): TerminalSize => ({
	cols: Math.max(1, Math.min(MAX_TERMINAL_COLS, Math.floor(size.cols))),
	rows: Math.max(1, Math.min(MAX_TERMINAL_ROWS, Math.floor(size.rows))),
});
