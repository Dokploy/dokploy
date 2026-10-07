import { ExecError } from "./ExecError";

/**
 * Helpers for work nobody awaits: cron callbacks, timers and fire-and-forget
 * calls.
 *
 * node-schedule, setInterval and a bare `void promise` all drop the promise
 * they are handed, so a rejection inside them reaches the process-wide
 * `unhandledRejection` handler, which reports it to Sentry with no request or
 * server context. A remote server being offline (SSH handshake timeout,
 * EHOSTUNREACH, ...) is an environment condition, not a bug: log it with
 * context and carry on. Anything else is most likely a programmer error, so it
 * is logged and also handed to the registered error reporter.
 *
 * Do not use these in request paths; tRPC procedures must still surface their
 * errors to the caller.
 */

const ENVIRONMENT_ERROR_CODES = new Set([
	"ECONNREFUSED",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EHOSTDOWN",
	"ETIMEDOUT",
	"ECONNRESET",
	"EPIPE",
]);

const ENVIRONMENT_ERROR_MESSAGES = [
	"SSH connection error",
	"Timed out while waiting for handshake",
];

const MAX_CAUSE_DEPTH = 5;

const isEnvironmentErrorShallow = (error: unknown): boolean => {
	if (error instanceof ExecError) {
		return true;
	}
	if (typeof error !== "object" || error === null) {
		return false;
	}
	const { code, level, message } = error as {
		code?: unknown;
		level?: unknown;
		message?: unknown;
	};
	// ssh2 tags its failures with a `level` ("client-socket", "handshake", ...).
	if (typeof level === "string" && level.length > 0) {
		return true;
	}
	if (typeof code === "string" && ENVIRONMENT_ERROR_CODES.has(code)) {
		return true;
	}
	return (
		typeof message === "string" &&
		ENVIRONMENT_ERROR_MESSAGES.some((fragment) => message.includes(fragment))
	);
};

/**
 * True for failures that come from the environment rather than from a bug: an
 * ExecError, an ssh2 error (it carries a `level`), a network error code such
 * as ECONNREFUSED/EHOSTUNREACH/ETIMEDOUT, or an SSH connection/handshake
 * message. The `cause` chain is walked as well.
 */
export const isEnvironmentError = (error: unknown): boolean => {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
		if (isEnvironmentErrorShallow(current)) {
			return true;
		}
		if (typeof current !== "object" || current === null) {
			return false;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
};

/**
 * Receives the errors that are not environment conditions. The server package
 * cannot import the app's Sentry module, so the app registers one at startup.
 */
export type BackgroundErrorReporter = (
	error: unknown,
	tags: Record<string, string>,
) => void;

let reporter: BackgroundErrorReporter | undefined;

/** Registers where unexpected background errors are reported (e.g. Sentry). */
export const setBackgroundErrorReporter = (
	fn: BackgroundErrorReporter | undefined,
): void => {
	reporter = fn;
};

/**
 * Reports `error` through the registered reporter unless it is an environment
 * error. Never throws.
 */
export const reportUnexpectedError = (
	error: unknown,
	tags: Record<string, string>,
): void => {
	if (!reporter || isEnvironmentError(error)) {
		return;
	}
	try {
		reporter(error, tags);
	} catch (reportingError) {
		console.error("Background error reporter failed", reportingError);
	}
};

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Runs `job` and resolves once it settles. Never rejects: a failure is logged
 * with `label` and `context` (for example `{ serverId }`; keep secrets out of
 * it), and reported unless it is an environment error.
 */
export const runBackgroundJob = async (
	label: string,
	job: () => unknown,
	context: Record<string, unknown> = {},
): Promise<void> => {
	try {
		await job();
	} catch (error) {
		console.error(`${label} failed`, context, describeError(error));
		reportUnexpectedError(error, { handler: "backgroundJob", label });
	}
};

/** Wraps `job` for APIs that drop the callback's promise (node-schedule, timers). */
export const backgroundJob =
	(label: string, job: () => unknown, context: Record<string, unknown> = {}) =>
	(): Promise<void> =>
		runBackgroundJob(label, job, context);
