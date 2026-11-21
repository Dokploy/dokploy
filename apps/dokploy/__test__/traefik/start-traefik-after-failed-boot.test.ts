import { startTraefikAfterFailedBoot } from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

// What Docker records when the swarm network isn't ready at boot.
const BOOT_ERROR =
	"failed to set up container networking: could not find a network matching network mode dokploy-network: network dokploy-network not found";

const fakeTraefik = (
	state: { Running: boolean; ExitCode: number; Error: string } | null,
) => {
	const start = vi.fn(async () => {});
	const createContainer = vi.fn();
	mocks.getRemoteDocker.mockResolvedValue({
		createContainer,
		getContainer: () => ({
			inspect: async () => {
				if (!state) {
					throw Object.assign(new Error("No such container: dokploy-traefik"), {
						statusCode: 404,
					});
				}
				return { State: state };
			},
			start,
		}),
	});
	return { start, createContainer };
};

describe("startTraefikAfterFailedBoot", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("starts Traefik when Docker failed to start it at boot", async () => {
		const { start } = fakeTraefik({
			Running: false,
			ExitCode: 128,
			Error: BOOT_ERROR,
		});

		await startTraefikAfterFailedBoot();

		expect(start).toHaveBeenCalledOnce();
	});

	it.each([
		["docker stop", 0],
		["docker kill", 137],
	])("leaves a Traefik stopped with %s alone", async (_, exitCode) => {
		const { start } = fakeTraefik({
			Running: false,
			ExitCode: exitCode,
			Error: "",
		});

		await startTraefikAfterFailedBoot();

		expect(start).not.toHaveBeenCalled();
	});

	it("leaves a running Traefik alone", async () => {
		const { start } = fakeTraefik({ Running: true, ExitCode: 0, Error: "" });

		await startTraefikAfterFailedBoot();

		expect(start).not.toHaveBeenCalled();
	});

	it("does not recreate a removed Traefik", async () => {
		const { start, createContainer } = fakeTraefik(null);

		await expect(startTraefikAfterFailedBoot()).resolves.toBeUndefined();

		expect(start).not.toHaveBeenCalled();
		expect(createContainer).not.toHaveBeenCalled();
	});
});
