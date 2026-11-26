import postgres from "postgres";
import { dbUrl } from "../../db/constants";

/**
 * Postgres session advisory locks, shared by every process that talks to
 * Dokploy's database: the web app, its deploy worker and the autoscaler. A
 * lock lives on its own connection and is released by Postgres if that
 * process dies, so a crash never leaves a target locked.
 */
export interface AdvisoryLease {
	release(): Promise<void>;
	/** False once the connection holding the lock is gone. */
	isHeld(): Promise<boolean>;
}

let pool: postgres.Sql | null = null;

// A separate pool, so locks held for the length of a deploy never take
// connections from the queries that run meanwhile.
const lockPool = () => {
	pool ??= postgres(dbUrl, {
		max: 20,
		idle_timeout: 60,
		connection: { application_name: "dokploy-locks" },
	});
	return pool;
};

export const acquireAdvisoryLock = async (
	key: string,
	{ wait }: { wait: boolean },
): Promise<AdvisoryLease | null> => {
	const connection = await lockPool().reserve();
	try {
		if (wait) {
			await connection`select pg_advisory_lock(hashtextextended(${key}, 0))`;
		} else {
			const [row] = await connection<{ locked: boolean }[]>`
				select pg_try_advisory_lock(hashtextextended(${key}, 0)) as locked`;
			if (!row?.locked) {
				connection.release();
				return null;
			}
		}
	} catch (error) {
		connection.release();
		throw error;
	}

	let released = false;
	return {
		release: async () => {
			if (released) return;
			released = true;
			await connection`select pg_advisory_unlock(hashtextextended(${key}, 0))`.catch(
				() => undefined,
			);
			connection.release();
		},
		isHeld: async () => {
			if (released) return false;
			try {
				await connection`select 1`;
				return true;
			} catch {
				return false;
			}
		},
	};
};

export const withAdvisoryLock = async <T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const lease = await acquireAdvisoryLock(key, { wait: true });
	if (!lease) throw new Error(`Could not lock ${key}`);
	try {
		return await fn();
	} finally {
		await lease.release();
	}
};

/** Whether another session holds `key` right now. */
export const isAdvisoryLockHeld = async (key: string) => {
	const lease = await acquireAdvisoryLock(key, { wait: false });
	if (!lease) return true;
	await lease.release();
	return false;
};
