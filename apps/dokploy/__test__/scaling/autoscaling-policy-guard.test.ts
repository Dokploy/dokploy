import type { AutoscalingPolicy } from "@dokploy/server/db/schema";
import { assertPolicyUnchanged } from "@dokploy/server/services/scaling/autoscaling-policy";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { autoscalingPolicies: { findFirst: mocks.findFirst } } },
}));

const read = {
	autoscalingPolicyId: "p1",
	enabled: true,
	updatedAt: new Date("2026-01-01T00:00:00Z"),
} as AutoscalingPolicy;

describe("assertPolicyUnchanged", () => {
	beforeEach(() => mocks.findFirst.mockReset());

	it("lets an unchanged, enabled policy through", async () => {
		mocks.findFirst.mockResolvedValue({ ...read });
		await expect(assertPolicyUnchanged(read)).resolves.toBeUndefined();
	});

	it("rejects once autoscaling was turned off", async () => {
		mocks.findFirst.mockResolvedValue({ ...read, enabled: false });
		await expect(assertPolicyUnchanged(read)).rejects.toMatchObject({
			reason: "autoscaling_changed",
		});
	});

	it("rejects once the settings were edited", async () => {
		mocks.findFirst.mockResolvedValue({
			...read,
			updatedAt: new Date("2026-01-01T00:00:05Z"),
		});
		await expect(assertPolicyUnchanged(read)).rejects.toMatchObject({
			reason: "autoscaling_changed",
		});
	});

	it("rejects once the policy is gone", async () => {
		mocks.findFirst.mockResolvedValue(undefined);
		await expect(assertPolicyUnchanged(read)).rejects.toMatchObject({
			reason: "autoscaling_changed",
		});
	});
});
