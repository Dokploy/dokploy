import { quote } from "shell-quote";

// Escapes a value so it is safe to interpolate as a single argument into a
// /bin/sh -c command string (local execAsync and remote SSH execAsyncRemote).
export const shellWord = (value: string | number | null | undefined): string =>
	quote([String(value ?? "")]);
