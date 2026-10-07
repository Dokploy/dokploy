/**
 * Helpers for work nobody awaits: cron callbacks, timers and fire-and-forget
 * calls.
 *
 * node-schedule, setInterval and a bare `void promise` all drop the promise
 * they are handed, so a rejection inside them reaches the process-wide
 * `unhandledRejection` handler, which reports it to Sentry with no request or
 * server context. A remote server being offline (SSH handshake timeout,
 * EHOSTUNREACH, ...) is an environment condition, not a bug: log it with
 * context and carry on.
 *
 * Do not use these in request paths; tRPC procedures must still surface their
 * errors to the caller.
 */

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Runs `job` and resolves once it settles. Never rejects: a failure is logged
 * with `label` and `context` (for example `{ serverId }`; keep secrets out of
 * it).
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
	}
};

/** Wraps `job` for APIs that drop the callback's promise (node-schedule, timers). */
export const backgroundJob =
	(label: string, job: () => unknown, context: Record<string, unknown> = {}) =>
	(): Promise<void> =>
		runBackgroundJob(label, job, context);
