/**
 * Process life cycle of the deployment queue: the start gate that waits for the
 * boot replay, and the SIGTERM shutdown.
 */

/** Longest the worker stays held back waiting for the boot replay. */
export const RESTORE_GATE_TIMEOUT_MS = 30_000;

/**
 * Wait for running jobs on SIGTERM. Swarm sends SIGKILL after the service's
 * StopGracePeriod (10s in prod); wait + flush must leave room for the final
 * journal deletes: 6.5s + 1s stays under 8s.
 */
export const SHUTDOWN_GRACE_MS = 6_500;
export const SHUTDOWN_FLUSH_MS = 1_000;

interface Pausable {
	pause(): void;
	resume(): void;
}

/**
 * Hold the worker until `open()` is called (the boot replay finished or
 * failed), so jobs restored from the journal are in the queue before anything
 * starts and a webhook that arrives early cannot run ahead of its own older
 * copy. Jobs enqueued meanwhile are journaled and simply wait. A safety timer
 * opens the gate regardless, so a broken replay can never block deploys.
 */
export const gateWorkerUntilRestored = (
	queue: Pausable,
	timeoutMs = RESTORE_GATE_TIMEOUT_MS,
) => {
	let opened = false;
	queue.pause();
	const timer = setTimeout(() => {
		if (opened) return;
		console.error(
			`Deployment queue: restore did not finish within ${timeoutMs}ms, starting the worker anyway`,
		);
		open();
	}, timeoutMs);
	timer.unref?.();

	function open() {
		if (opened) return;
		opened = true;
		clearTimeout(timer);
		queue.resume();
	}

	return { open };
};

interface ShutdownTarget {
	shutdown(graceMs: number, flushMs: number): Promise<void>;
}

interface ProcessLike {
	on(event: "SIGTERM", listener: () => void): unknown;
}

/** Register the SIGTERM handler: drain for a short grace period, then exit. */
export const registerShutdownHandler = (
	queue: ShutdownTarget,
	proc: ProcessLike = process,
	exit: (code: number) => void = (code) => process.exit(code),
) => {
	proc.on("SIGTERM", () => {
		// The journal is the real guarantee: whatever is still running when the
		// grace period ends is re-run on the next boot.
		void queue
			.shutdown(SHUTDOWN_GRACE_MS, SHUTDOWN_FLUSH_MS)
			.catch((error) => console.error("Queue shutdown failed", error))
			.finally(() => exit(0));
	});
};
