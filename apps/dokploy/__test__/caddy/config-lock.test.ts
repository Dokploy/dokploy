import { fs } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

const execAsyncMock = vi.hoisted(() => vi.fn());
const execAsyncRemoteMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

import { withCaddyConfigLock } from "@dokploy/server";
import { expect, test, vi } from "vitest";

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

test("serializes tasks for the same server", async () => {
	const order: string[] = [];
	const firstGate = deferred();

	const first = withCaddyConfigLock(undefined, async () => {
		order.push("first:start");
		await firstGate.promise;
		order.push("first:end");
	});
	const second = withCaddyConfigLock(undefined, async () => {
		order.push("second:start");
	});

	// Let the second task start if the lock (incorrectly) allowed it.
	await new Promise((resolve) => setImmediate(resolve));
	expect(order).toEqual(["first:start"]);

	firstGate.resolve();
	await Promise.all([first, second]);
	expect(order).toEqual(["first:start", "first:end", "second:start"]);
});

test("runs tasks for different servers concurrently", async () => {
	const order: string[] = [];
	const localGate = deferred();

	const local = withCaddyConfigLock(undefined, async () => {
		order.push("local:start");
		await localGate.promise;
		order.push("local:end");
	});
	const remote = withCaddyConfigLock("server-1", async () => {
		order.push("remote:start");
	});

	await remote;
	expect(order).toEqual(["local:start", "remote:start"]);

	localGate.resolve();
	await local;
	expect(order).toEqual(["local:start", "remote:start", "local:end"]);
});

test("releases the lock after a failed task and propagates the error", async () => {
	const failing = withCaddyConfigLock(undefined, async () => {
		throw new Error("compile failed");
	});
	await expect(failing).rejects.toThrow("compile failed");

	const result = await withCaddyConfigLock(undefined, async () => "recovered");
	expect(result).toBe("recovered");
});

test("returns the task result", async () => {
	await expect(
		withCaddyConfigLock("server-2", async () => 42),
	).resolves.toBe(42);
});
