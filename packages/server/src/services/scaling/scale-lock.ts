import { acquireAdvisoryLock, isAdvisoryLockHeld } from "./advisory-lock";

const scaleLocks = new Map<string, Promise<unknown>>();
const deploying = new Map<string, number>();

/** Another process holds the lock and the caller asked not to wait. */
export class ScaleLockBusyError extends Error {
	constructor(key: string) {
		super(`${key} is being changed by another process`);
		this.name = "ScaleLockBusyError";
	}
}

const inProcess = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
	const previous = scaleLocks.get(key) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(fn);
	scaleLocks.set(key, current);
	try {
		return await current;
	} finally {
		if (scaleLocks.get(key) === current) {
			scaleLocks.delete(key);
		}
	}
};

/**
 * Runs `fn` after every earlier holder of `key` has finished, in this process
 * and in every other Dokploy process (the web app and the autoscaler), so
 * scaling and deploys of the same target never interleave. With
 * `wait: false`, a holder in another process makes it throw
 * ScaleLockBusyError at once.
 */
export const withScaleLock = <T>(
	key: string,
	fn: () => Promise<T>,
	{ wait = true }: { wait?: boolean } = {},
): Promise<T> =>
	inProcess(key, async () => {
		const lease = await acquireAdvisoryLock(`dokploy:scale:${key}`, { wait });
		if (!lease) throw new ScaleLockBusyError(key);
		try {
			return await fn();
		} finally {
			await lease.release();
		}
	});

export const composeScaleLockKey = (composeId: string) =>
	`compose:${composeId}`;

/**
 * Wraps a deploy so that a scale request arriving while it runs is refused
 * instead of queued: deploys take minutes and rewrite the files a scale uses.
 * The deploy itself still waits for a scale that started before it.
 */
export const withDeployLock = async <T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> => {
	deploying.set(key, (deploying.get(key) ?? 0) + 1);
	try {
		const marker = await acquireAdvisoryLock(`dokploy:deploy:${key}`, {
			wait: true,
		});
		try {
			return await withScaleLock(key, fn);
		} finally {
			await marker?.release();
		}
	} finally {
		const remaining = (deploying.get(key) ?? 1) - 1;
		if (remaining > 0) deploying.set(key, remaining);
		else deploying.delete(key);
	}
};

/** Whether a deploy of `key` runs or waits in any Dokploy process. */
export const isDeploying = async (key: string) =>
	(deploying.get(key) ?? 0) > 0 ||
	(await isAdvisoryLockHeld(`dokploy:deploy:${key}`));
