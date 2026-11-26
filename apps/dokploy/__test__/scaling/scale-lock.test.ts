import {
	isDeploying,
	withDeployLock,
	withScaleLock,
} from "@dokploy/server/services/scaling/scale-lock";
import { describe, expect, it } from "vitest";

const deferred = () => {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

describe("scale lock", () => {
	it("runs holders of the same key one after another", async () => {
		const order: string[] = [];
		const first = deferred();
		const a = withScaleLock("k1", async () => {
			order.push("a:start");
			await first.promise;
			order.push("a:end");
		});
		const b = withScaleLock("k1", async () => {
			order.push("b");
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(order).toEqual(["a:start"]);
		first.resolve();
		await Promise.all([a, b]);
		expect(order).toEqual(["a:start", "a:end", "b"]);
	});

	it("marks a key as deploying for the whole deploy, including the wait", async () => {
		const scale = deferred();
		const scaling = withScaleLock("k2", () => scale.promise);
		const deploy = deferred();
		const deploying = withDeployLock("k2", () => deploy.promise);

		expect(await isDeploying("k2")).toBe(true);
		scale.resolve();
		await scaling;
		expect(await isDeploying("k2")).toBe(true);
		deploy.resolve();
		await deploying;
		expect(await isDeploying("k2")).toBe(false);
	});

	it("keeps the mark until the last overlapping deploy ends", async () => {
		const one = deferred();
		const two = deferred();
		const first = withDeployLock("k3", () => one.promise);
		const second = withDeployLock("k3", () => two.promise);
		one.resolve();
		await first;
		expect(await isDeploying("k3")).toBe(true);
		two.resolve();
		await second;
		expect(await isDeploying("k3")).toBe(false);
	});

	it("clears the mark when the deploy fails", async () => {
		await expect(
			withDeployLock("k4", async () => {
				throw new Error("build failed");
			}),
		).rejects.toThrow("build failed");
		expect(await isDeploying("k4")).toBe(false);
	});
});
