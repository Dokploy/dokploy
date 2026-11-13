import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForTraefikReload } from "@/utils/wait-for-traefik-reload";

const running = { state: "running", isReloading: false, lastReloadError: null };
describe("reload result polling", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	it("waits through a dropped proxy connection and an unfinished reload", async () => {
		const status = vi
			.fn()
			.mockRejectedValueOnce(new Error("network error"))
			.mockResolvedValueOnce({ ...running, isReloading: true })
			.mockResolvedValue(running);
		const result = waitForTraefikReload(status);
		await vi.runAllTimersAsync();
		await expect(result).resolves.toBeUndefined();
		expect(status).toHaveBeenCalledTimes(3);
	});
	it("reports a recovery error even when the panel health endpoint would be healthy", async () => {
		await expect(
			waitForTraefikReload(async () => ({
				...running,
				lastReloadError: "network attachment failed",
			})),
		).rejects.toThrow("network attachment failed");
	});
	it("does not report a stopped selected-server Traefik as a successful reload", async () => {
		const result = waitForTraefikReload(async () => ({
			...running,
			state: "exited",
		})).catch((error) => error);
		await vi.runAllTimersAsync();
		expect(await result).toMatchObject({
			message: "Traefik has not recovered yet. Check View Logs for errors.",
		});
	});
});
