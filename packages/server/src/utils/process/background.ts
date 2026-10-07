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
	...ENVIRONMENT_ERROR_CODES,
];

const MAX_CAUSE_DEPTH = 5;
// Hard stop for a pathological (very wide) error graph.
const MAX_VISITED_ERRORS = 50;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/**
 * An ExecError, also recognised by name so a duplicate copy of this package
 * (for example one bundled into the app next to the dist build) still counts.
 */
const isExecError = (error: Record<string, unknown>): boolean =>
	error instanceof ExecError || error.name === "ExecError";

const matchesEnvironmentMessage = (message: unknown): boolean =>
	typeof message === "string" &&
	ENVIRONMENT_ERROR_MESSAGES.some((fragment) => message.includes(fragment));

const isEnvironmentErrorShallow = (error: unknown): boolean => {
	if (!isObject(error)) {
		return false;
	}
	// ssh2 tags its failures with a `level` ("client-socket", "handshake", ...).
	if (typeof error.level === "string" && error.level.length > 0) {
		return true;
	}
	if (
		typeof error.code === "string" &&
		ENVIRONMENT_ERROR_CODES.has(error.code)
	) {
		return true;
	}
	if (matchesEnvironmentMessage(error.message)) {
		return true;
	}
	// An ExecError without a numeric exit code never ran to completion: the
	// connection (or the spawn) failed. One that carries an exit code is a
	// command that really failed, which is not an environment condition.
	return isExecError(error) && typeof error.exitCode !== "number";
};

/** The errors wrapped by `error`, in the shapes this codebase uses. */
const wrappedErrors = (error: Record<string, unknown>): unknown[] => {
	const wrapped: unknown[] = [error.cause, error.originalError];
	if (isObject(error.context)) {
		wrapped.push(error.context.originalError);
	}
	if (Array.isArray(error.errors)) {
		wrapped.push(...error.errors);
	}
	return wrapped;
};

/**
 * True for failures that come from the environment rather than from a bug: an
 * ExecError that never got an exit code (the connection failed), an ssh2 error
 * (it carries a `level`), a network error code such as ECONNREFUSED /
 * EHOSTUNREACH / ETIMEDOUT, or an SSH connection / handshake message. Wrapped
 * errors (`cause`, `originalError`, `context.originalError`, AggregateError
 * `errors`) are searched too, to a bounded depth and safely against cycles.
 */
export const isEnvironmentError = (error: unknown): boolean => {
	const seen = new Set<unknown>();
	let frontier: unknown[] = [error];
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
		const next: unknown[] = [];
		for (const candidate of frontier) {
			if (!isObject(candidate) || seen.has(candidate)) {
				continue;
			}
			if (seen.size >= MAX_VISITED_ERRORS) {
				return false;
			}
			seen.add(candidate);
			if (isEnvironmentErrorShallow(candidate)) {
				return true;
			}
			next.push(...wrappedErrors(candidate));
		}
		frontier = next;
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

// The app can end up with more than one copy of this module (the dist build
// behind the `@dokploy/server` barrel and a bundled deep import), so the
// reporter lives in a process-wide slot that every copy shares.
const REPORTER_SLOT = Symbol.for("dokploy.backgroundErrorReporter");

type ReporterSlot = { reporter?: BackgroundErrorReporter };

const reporterSlot = (): ReporterSlot => {
	const registry = globalThis as unknown as Record<symbol, ReporterSlot>;
	let slot = registry[REPORTER_SLOT];
	if (!slot) {
		slot = {};
		registry[REPORTER_SLOT] = slot;
	}
	return slot;
};

/** Registers where unexpected background errors are reported (e.g. Sentry). */
export const setBackgroundErrorReporter = (
	fn: BackgroundErrorReporter | undefined,
): void => {
	reporterSlot().reporter = fn;
};

/**
 * Reports `error` through the registered reporter unless it is an environment
 * error. Never throws.
 */
export const reportUnexpectedError = (
	error: unknown,
	tags: Record<string, string>,
): void => {
	const reporter = reporterSlot().reporter;
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
