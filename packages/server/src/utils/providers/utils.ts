import { quote } from "shell-quote";

/**
 * Escapes a single value so it can be safely interpolated as one argument into
 * a `/bin/sh -c` command string (both local `execAsync` and remote SSH
 * `execAsyncRemote`). User-controlled fields such as git URLs, branch names,
 * repository owners and SSH hostnames must never reach a shell unescaped.
 */
export const shellWord = (value: string | number | null | undefined): string =>
	quote([String(value ?? "")]);
