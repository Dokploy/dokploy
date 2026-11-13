import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTraefikRecovery } from "@/server/utils/traefik-recovery";

const mocks = vi.hoisted(() => ({ recoverTraefik: vi.fn() }));
vi.mock("@dokploy/server", () => mocks);
describe("Traefik recovery timer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.recoverTraefik.mockResolvedValue(undefined);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	it("checks at startup and every minute, and stops on shutdown", async () => {
		const stop = startTraefikRecovery();
		expect(mocks.recoverTraefik).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.recoverTraefik).toHaveBeenCalledTimes(2);
		stop();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.recoverTraefik).toHaveBeenCalledTimes(2);
	});
	it("skips overlapping checks and retries failures", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		let finish!: () => void;
		mocks.recoverTraefik.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		const stop = startTraefikRecovery();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(mocks.recoverTraefik).toHaveBeenCalledTimes(1);
		finish();
		mocks.recoverTraefik.mockRejectedValueOnce(new Error("overlay not ready"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(error).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.recoverTraefik).toHaveBeenCalledTimes(3);
		stop();
	});
});
