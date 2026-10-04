import { stopComposeBeforeTransfer } from "@dokploy/server/services/transfer-safety";
import { describe, expect, it, vi } from "vitest";

describe("stopComposeBeforeTransfer", () => {
	it("propagates stop failures before transfer can continue", async () => {
		const failure = new Error("compose is still running");
		const stop = vi.fn().mockRejectedValue(failure);
		const log = vi.fn();

		await expect(
			stopComposeBeforeTransfer(stop, "compose-1", log),
		).rejects.toBe(failure);
		expect(stop).toHaveBeenCalledWith("compose-1");
		expect(log).toHaveBeenCalledWith(
			"  Could not stop compose: compose is still running",
		);
	});

	it("allows transfer to continue only after a successful stop", async () => {
		const stop = vi.fn().mockResolvedValue(undefined);
		await expect(
			stopComposeBeforeTransfer(stop, "compose-1", vi.fn()),
		).resolves.toBeUndefined();
	});
});
