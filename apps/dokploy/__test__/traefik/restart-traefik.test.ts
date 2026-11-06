import {
	queueTraefikTask,
	restartTraefik,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const statusError = (message: string, statusCode: number) =>
	Object.assign(new Error(message), { statusCode });

const fakeDocker = ({
	running = true,
	crashesAfterRestart = false,
	inspectError,
}: {
	running?: boolean;
	crashesAfterRestart?: boolean;
	inspectError?: Error;
} = {}) => {
	const log: string[] = [];
	let state = { running, startedAt: "start-0" };
	let restarts = 0;
	const traefik = {
		inspect: async () => {
			if (inspectError) throw inspectError;
			return {
				Id: "traefik",
				State: { Running: state.running, StartedAt: state.startedAt },
			};
		},
		restart: async () => {
			restarts += 1;
			log.push("restart");
			state = {
				running: !crashesAfterRestart,
				startedAt: `start-${restarts}`,
			};
		},
		logs: async () => Buffer.alloc(0),
	};
	const docker = {
		getContainer: (ref: string) => {
			if (ref !== "dokploy-traefik" && ref !== "traefik") {
				throw statusError(`No such container: ${ref}`, 404);
			}
			return traefik;
		},
	};
	return { docker, log };
};

describe("restartTraefik", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const run = async (
		fake: ReturnType<typeof fakeDocker>,
		options?: { startIfStopped?: boolean },
	) => {
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		const result = restartTraefik("server-1", options).then(
			(restarted) => ({ restarted, error: null }),
			(error: Error) => ({ restarted: null, error }),
		);
		await vi.runAllTimersAsync();
		return result;
	};

	it("restarts a running Traefik once and checks that it stays up", async () => {
		const fake = fakeDocker();

		const { restarted, error } = await run(fake);

		expect(error).toBeNull();
		expect(restarted).toBe(true);
		expect(fake.log).toEqual(["restart"]);
		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("server-1");
	});

	it("leaves a stopped Traefik stopped", async () => {
		const fake = fakeDocker({ running: false });

		const { restarted } = await run(fake);

		expect(restarted).toBe(false);
		expect(fake.log).toEqual([]);
	});

	it("starts a stopped Traefik when asked to", async () => {
		const fake = fakeDocker({ running: false });

		const { restarted } = await run(fake, { startIfStopped: true });

		expect(restarted).toBe(true);
		expect(fake.log).toEqual(["restart"]);
	});

	it("reports a Traefik that stops right after the restart", async () => {
		const fake = fakeDocker({ crashesAfterRestart: true });

		const { error } = await run(fake);

		expect(error?.message).toBe("Traefik stopped right after starting");
	});

	it("explains a missing Traefik and passes other Docker errors through", async () => {
		const missing = await run(
			fakeDocker({ inspectError: statusError("No such container", 404) }),
		);
		const unreachable = await run(
			fakeDocker({
				inspectError: new Error("Cannot connect to the Docker daemon"),
			}),
		);

		expect(missing.error?.message).toBe(
			"The dokploy-traefik container was not found on this server.",
		);
		expect(unreachable.error?.message).toBe(
			"Cannot connect to the Docker daemon",
		);
	});
});

describe("queueTraefikTask", () => {
	it("runs tasks for the same server one after another and returns their results", async () => {
		const log: string[] = [];
		let finish = () => {};
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});

		const first = queueTraefikTask("server-q", async () => {
			log.push("first starts");
			await gate;
			log.push("first ends");
			return 1;
		});
		const second = queueTraefikTask("server-q", async () => {
			log.push("second");
			return 2;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toEqual(["first starts"]);

		finish();

		await expect(first).resolves.toBe(1);
		await expect(second).resolves.toBe(2);
		expect(log).toEqual(["first starts", "first ends", "second"]);
	});
});
