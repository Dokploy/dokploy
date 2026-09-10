import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => ({
	db: { query: { sandboxes: { findMany } } },
}));
vi.mock("@dokploy/server/services/sandbox", () => ({
	killSandbox: vi.fn(),
}));

import {
	findExpiredSandboxes,
	planSandboxReconcile,
	reapExpiredSandboxes,
} from "@dokploy/server/utils/sandbox/reaper";

const now = new Date("2026-09-10T12:00:00Z");
const past = new Date(now.getTime() - 1000);
const future = new Date(now.getTime() + 60_000);

beforeEach(() => {
	findMany.mockReset();
});

describe("findExpiredSandboxes", () => {
	it("returns only running sandboxes whose expiresAt has passed", () => {
		const list = [
			{ sandboxId: "expired", status: "running", expiresAt: past },
			{ sandboxId: "alive", status: "running", expiresAt: future },
			{ sandboxId: "no-expiry", status: "running", expiresAt: null },
			{ sandboxId: "killed", status: "killed", expiresAt: past },
			{ sandboxId: "error", status: "error", expiresAt: past },
		];
		expect(findExpiredSandboxes(list, now).map((s) => s.sandboxId)).toEqual([
			"expired",
		]);
	});
});

describe("reapExpiredSandboxes", () => {
	it("kills expired sandboxes and leaves the rest untouched", async () => {
		findMany.mockResolvedValue([
			{ sandboxId: "expired", status: "running", expiresAt: past },
			{ sandboxId: "alive", status: "running", expiresAt: future },
		]);
		const kill = vi.fn(async () => undefined);
		const killed = await reapExpiredSandboxes(now, kill);
		expect(killed).toEqual(["expired"]);
		expect(kill).toHaveBeenCalledTimes(1);
		expect(kill).toHaveBeenCalledWith("expired");
	});

	it("continues when one kill fails", async () => {
		findMany.mockResolvedValue([
			{ sandboxId: "a", status: "running", expiresAt: past },
			{ sandboxId: "b", status: "running", expiresAt: past },
		]);
		const kill = vi.fn(async (id: string) => {
			if (id === "a") throw new Error("docker down");
		});
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const killed = await reapExpiredSandboxes(now, kill);
		spy.mockRestore();
		expect(killed).toEqual(["b"]);
		expect(kill).toHaveBeenCalledTimes(2);
	});
});

describe("planSandboxReconcile", () => {
	const container = (id: string, sandboxId: string, state = "running") => ({
		Id: id,
		State: state,
		Labels: { "dokploy.sandbox": "true", "dokploy.sandboxId": sandboxId },
	});

	it("removes containers without a running row and errors rows without a container", () => {
		const plan = planSandboxReconcile(
			[
				{ sandboxId: "ok", containerId: "c-ok" },
				{ sandboxId: "gone", containerId: "c-gone" },
				{ sandboxId: "never-started", containerId: null },
			],
			[
				container("c-ok", "ok"),
				container("c-orphan", "orphan"),
				container("c-exited", "ok-old", "exited"),
			],
		);
		expect(plan.removeContainers).toEqual(["c-orphan", "c-exited"]);
		expect(plan.markError).toEqual(["gone", "never-started"]);
	});

	it("removes a stopped container even when its row is running, and errors the row", () => {
		const plan = planSandboxReconcile(
			[{ sandboxId: "sb", containerId: "c1" }],
			[container("c1", "sb", "exited")],
		);
		expect(plan.removeContainers).toEqual(["c1"]);
		expect(plan.markError).toEqual(["sb"]);
	});

	it("does nothing when everything matches", () => {
		const plan = planSandboxReconcile(
			[{ sandboxId: "sb", containerId: "c1" }],
			[container("c1", "sb")],
		);
		expect(plan).toEqual({ removeContainers: [], markError: [] });
	});
});
