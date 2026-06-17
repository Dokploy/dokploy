import { afterEach, describe, expect, it } from "vitest";

/**
 * Regression test for the Next.js double-load concurrency bug.
 *
 * Symptom: with `deploymentConcurrency=2` set, peak active jobs in BullMQ was 4.
 * Root cause: `workers`/`inflight`/`queues` Maps in `deployments-queue.ts` and
 * `queueSetup.ts` were module-scoped, not pinned to `globalThis`. Next.js
 * loaded each file from both the workspace package AND its own runtime,
 * producing two `workers` Maps in the same Node process. Each constructed an
 * independent BullMQ Worker against the same queue, doubling effective
 * concurrency.
 *
 * Fix: pin queue runtime state behind `Symbol.for(...)` keys on globalThis,
 * matching the pattern already used by `packages/server/src/utils/process/
 * job-context.ts` for the AsyncLocalStorage child registry.
 *
 * These tests verify the *pattern itself* — the bare module imports trigger
 * heavy side-effects (BullMQ, DB barrel) that are hard to mock cleanly in unit
 * tests, but the symbol-keyed pinning is a pure pattern we can lock in here.
 */

const QUEUE_STATE_KEY = Symbol.for("dokploy.deploymentQueue.state");
const QUEUES_KEY = Symbol.for("dokploy.deploymentQueue.queues");

type GlobalAny = typeof globalThis & Record<symbol, unknown>;

describe("queue runtime state pinning pattern", () => {
	afterEach(() => {
		delete (globalThis as GlobalAny)[QUEUE_STATE_KEY];
		delete (globalThis as GlobalAny)[QUEUES_KEY];
	});

	it("Symbol.for() returns the same key across calls (cross-realm sharing primitive)", () => {
		const a = Symbol.for("dokploy.deploymentQueue.state");
		const b = Symbol.for("dokploy.deploymentQueue.state");
		expect(a).toBe(b);
		// Sanity: a fresh local symbol is NOT shared.
		const local = Symbol("dokploy.deploymentQueue.state");
		expect(local).not.toBe(a);
	});

	it("nullish-coalesce assignment (??=) preserves the first writer's object", () => {
		// Simulate the deployments-queue.ts pattern:
		//   const queueState = g[KEY] ?? (g[KEY] = { workers: new Map(), ... });
		const g = globalThis as GlobalAny;
		const initial = { workers: new Map(), inflight: new Map() };
		const a =
			(g[QUEUE_STATE_KEY] as typeof initial | undefined) ??
			((g[QUEUE_STATE_KEY] = initial), initial);
		const b =
			(g[QUEUE_STATE_KEY] as typeof initial | undefined) ??
			((g[QUEUE_STATE_KEY] = { workers: new Map(), inflight: new Map() }),
			g[QUEUE_STATE_KEY] as typeof initial);
		expect(a).toBe(b);
		expect(a.workers).toBe(b.workers);
	});

	it("a second module load (with cleared cache) reuses globalThis-pinned Maps", () => {
		// First "module load" puts state on globalThis.
		const moduleA = (() => {
			const g = globalThis as GlobalAny;
			return ((g[QUEUE_STATE_KEY] as { workers: Map<unknown, unknown> }) ??
				(g[QUEUE_STATE_KEY] = {
					workers: new Map(),
					inflight: new Map(),
					cancelSubscriber: null,
					started: false,
				})) as { workers: Map<string, string> };
		})();
		moduleA.workers.set("srv-1", "worker-instance-A");

		// Second "module load" — different lexical scope, same globalThis.
		const moduleB = (() => {
			const g = globalThis as GlobalAny;
			return ((g[QUEUE_STATE_KEY] as { workers: Map<unknown, unknown> }) ??
				(g[QUEUE_STATE_KEY] = {
					workers: new Map(),
					inflight: new Map(),
					cancelSubscriber: null,
					started: false,
				})) as { workers: Map<string, string> };
		})();

		// CRITICAL: same workers Map across both "loads".
		expect(moduleB.workers).toBe(moduleA.workers);
		expect(moduleB.workers.get("srv-1")).toBe("worker-instance-A");
	});

	it("without pinning, two module instances would each have their own Map", () => {
		// Sanity: prove the bug shape this fix prevents.
		const moduleA = { workers: new Map<string, string>() };
		const moduleB = { workers: new Map<string, string>() };
		moduleA.workers.set("srv-1", "worker-A");
		moduleB.workers.set("srv-1", "worker-B");
		// Two separate Maps. BullMQ would construct two Workers for the same
		// queue, doubling effective concurrency.
		expect(moduleA.workers).not.toBe(moduleB.workers);
		expect(moduleA.workers.get("srv-1")).not.toEqual(
			moduleB.workers.get("srv-1"),
		);
	});

	it("symbol keys are stable (cross-package Realm-safe)", () => {
		// Symbol.for() keys are interned in the global symbol registry, which
		// is shared across realms. This is what makes the fix work for
		// Next.js's workspace-package double-load: both copies of the module
		// resolve to the SAME symbol via Symbol.for(), so they hit the same
		// globalThis property.
		expect(QUEUE_STATE_KEY).toBe(Symbol.for("dokploy.deploymentQueue.state"));
		expect(QUEUES_KEY).toBe(Symbol.for("dokploy.deploymentQueue.queues"));
		expect(QUEUE_STATE_KEY).not.toBe(QUEUES_KEY);
	});
});
