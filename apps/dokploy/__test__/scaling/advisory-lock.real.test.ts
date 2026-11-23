import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.unmock("@dokploy/server/services/scaling/advisory-lock");

// Needs a Postgres the test may take advisory locks on (it writes no data),
// for example a throwaway container.
const DATABASE_URL = process.env.DOKPLOY_TEST_DATABASE_URL;

describe.runIf(DATABASE_URL)("advisory locks (real Postgres)", () => {
	// Stands in for another Dokploy process: its own session.
	let other: postgres.Sql;
	let locks: typeof import("@dokploy/server/services/scaling/advisory-lock");
	let scaleLock: typeof import("@dokploy/server/services/scaling/scale-lock");

	const holdElsewhere = async (key: string) => {
		const connection = await other.reserve();
		await connection`select pg_advisory_lock(hashtextextended(${key}, 0))`;
		return {
			release: async () => {
				await connection`select pg_advisory_unlock(hashtextextended(${key}, 0))`;
				connection.release();
			},
		};
	};

	beforeAll(async () => {
		process.env.DATABASE_URL = DATABASE_URL;
		vi.resetModules();
		locks = await import("@dokploy/server/services/scaling/advisory-lock");
		scaleLock = await import("@dokploy/server/services/scaling/scale-lock");
		other = postgres(DATABASE_URL as string, { max: 4 });
	});

	afterAll(async () => {
		await other?.end();
	});

	it("keeps a held lock from other sessions until it is released", async () => {
		const first = await locks.acquireAdvisoryLock("lab:one", { wait: false });
		expect(first).not.toBeNull();
		expect(
			await locks.acquireAdvisoryLock("lab:one", { wait: false }),
		).toBeNull();
		expect(await locks.isAdvisoryLockHeld("lab:one")).toBe(true);

		await first?.release();
		const second = await locks.acquireAdvisoryLock("lab:one", { wait: false });
		expect(second).not.toBeNull();
		await second?.release();
		expect(await locks.isAdvisoryLockHeld("lab:one")).toBe(false);
	});

	it("frees the lock of a session that dies, and tells its holder", async () => {
		const lease = await locks.acquireAdvisoryLock("lab:crash", {
			wait: false,
		});
		expect(await lease?.isHeld()).toBe(true);

		await other`
			select pg_terminate_backend(pid) from pg_locks
			where locktype = 'advisory' and granted
			and ((classid::bigint << 32) | objid::bigint) = hashtextextended('lab:crash', 0)`;

		expect(await lease?.isHeld()).toBe(false);
		const next = await locks.acquireAdvisoryLock("lab:crash", { wait: false });
		expect(next).not.toBeNull();
		await next?.release();
	});

	it("sees a deploy running in another process", async () => {
		expect(await scaleLock.isDeploying("compose:c1")).toBe(false);
		const deploy = await holdElsewhere("dokploy:deploy:compose:c1");
		expect(await scaleLock.isDeploying("compose:c1")).toBe(true);
		await deploy.release();
		expect(await scaleLock.isDeploying("compose:c1")).toBe(false);
	});

	it("waits for a scale in another process, or refuses at once when asked not to wait", async () => {
		const scale = await holdElsewhere("dokploy:scale:app-1");

		await expect(
			scaleLock.withScaleLock("app-1", async () => "ran", { wait: false }),
		).rejects.toBeInstanceOf(scaleLock.ScaleLockBusyError);

		const order: string[] = [];
		const waiting = scaleLock.withScaleLock("app-1", async () => {
			order.push("ran");
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		order.push("released");
		await scale.release();
		await waiting;
		expect(order).toEqual(["released", "ran"]);
	});
});
