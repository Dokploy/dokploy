import {
	isTraefikRestartInProgress,
	queueTraefikTask,
	restoreInterruptedTraefik,
	restoreInterruptedTraefikOnServers,
	whileTraefikStopped,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDocker } from "./fake-traefik-docker";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

describe("whileTraefikStopped", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const run = async (
		fake: ReturnType<typeof fakeDocker>,
		task: () => Promise<unknown>,
	) => {
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		const result = whileTraefikStopped(undefined, task).then(
			() => null,
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();
		return result;
	};

	it("runs the task while Traefik is stopped and keeps a restart marker until it is back", async () => {
		const fake = fakeDocker();
		let runningDuringTask: boolean | undefined;

		const error = await run(fake, async () => {
			runningDuringTask = fake.containers[0]?.running;
			fake.log.push("task");
		});

		expect(error).toBeNull();
		expect(runningDuringTask).toBe(false);
		expect(fake.log).toEqual([
			"create dokploy-traefik-restarting",
			"stop traefik",
			"task",
			"start traefik",
			"remove marker",
		]);
		expect(fake.createdWith()).toEqual({
			name: "dokploy-traefik-restarting",
			Image: "sha256:traefik-image",
			Labels: { "dokploy.restart.owner": expect.any(String) },
		});
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("starts Traefik again and reports the error when the task fails", async () => {
		const fake = fakeDocker();

		const error = await run(fake, async () => {
			throw new Error("disk full");
		});

		expect(error?.message).toBe("disk full");
		expect(fake.log).toEqual([
			"create dokploy-traefik-restarting",
			"stop traefik",
			"start traefik",
			"remove marker",
		]);
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("keeps the marker when Traefik can't start again, so recovery retries it", async () => {
		const fake = fakeDocker({
			startError: new Error("port is already allocated"),
		});

		const error = await run(fake, async () => {});

		expect(error?.message).toBe("port is already allocated");
		expect(fake.containers.map((c) => c.name)).toEqual([
			"dokploy-traefik",
			"dokploy-traefik-restarting",
		]);
	});

	it("runs the pre-stop check inside the queue, before stopping Traefik", async () => {
		const fake = fakeDocker();
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		const result = whileTraefikStopped(
			undefined,
			async () => {
				fake.log.push("task");
			},
			async () => {
				fake.log.push("check");
			},
		);
		await vi.runAllTimersAsync();
		await result;

		expect(fake.log).toEqual([
			"check",
			"create dokploy-traefik-restarting",
			"stop traefik",
			"task",
			"start traefik",
			"remove marker",
		]);
	});

	it("leaves Traefik running when the pre-stop check fails", async () => {
		const fake = fakeDocker();
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		const result = whileTraefikStopped(
			undefined,
			async () => {},
			async () => {
				throw new Error("routes unreadable");
			},
		).then(
			() => null,
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();

		expect((await result)?.message).toBe("routes unreadable");
		expect(fake.log).toEqual([]);
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("makes recovery and Reload wait until Traefik is back", async () => {
		const fake = fakeDocker();
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		let finish = () => {};
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});

		const cleanup = whileTraefikStopped(undefined, async () => {
			fake.log.push("task");
			await gate;
		});
		await vi.advanceTimersByTimeAsync(10);
		const restore = restoreInterruptedTraefik();
		const reload = queueTraefikTask(undefined, async () => {
			fake.log.push("reload");
		});
		await vi.advanceTimersByTimeAsync(10);

		expect(fake.log).toEqual([
			"create dokploy-traefik-restarting",
			"stop traefik",
			"task",
		]);

		finish();
		await vi.runAllTimersAsync();
		await Promise.all([cleanup, restore, reload]);

		expect(fake.log).toEqual([
			"create dokploy-traefik-restarting",
			"stop traefik",
			"task",
			"start traefik",
			"remove marker",
			"reload",
		]);
	});

	it("puts the original back and starts Traefik again when it doesn't stay up", async () => {
		const fake = fakeDocker({ crashingStarts: 1 });

		const error = await run(fake, async () => {
			fake.log.push("change");
			return async () => {
				fake.log.push("undo");
			};
		});

		expect(error?.message).toBe(
			"Traefik stopped right after starting. The change was undone. Traefik is running again.",
		);
		expect(fake.log).toEqual([
			"create dokploy-traefik-restarting",
			"stop traefik",
			"change",
			"start traefik",
			"stop traefik",
			"undo",
			"start traefik",
			"remove marker",
		]);
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("keeps the marker when Traefik still doesn't start after the undo", async () => {
		const fake = fakeDocker({ crashingStarts: 2 });

		const error = await run(fake, async () => async () => {
			fake.log.push("undo");
		});

		expect(error?.message).toBe(
			"Traefik stopped right after starting. The change was undone. Traefik still did not start: Traefik stopped right after starting.",
		);
		expect(fake.log).toContain("undo");
		expect(fake.containers.map((c) => c.name)).toContain(
			"dokploy-traefik-restarting",
		);
	});

	it("still starts Traefik when undoing the change fails, and reports both", async () => {
		const fake = fakeDocker({ crashingStarts: 1 });

		const error = await run(fake, async () => async () => {
			throw new Error("disk full");
		});

		expect(error?.message).toBe(
			"Traefik stopped right after starting. Undoing the change failed: disk full. Traefik is running again.",
		);
		expect(fake.log.filter((line) => line === "start traefik")).toHaveLength(2);
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("leaves Traefik untouched when the pre-stop check says there is nothing to do", async () => {
		const fake = fakeDocker();
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		const task = vi.fn();

		const result = whileTraefikStopped(undefined, task, async () => false);
		await vi.runAllTimersAsync();
		await result;

		expect(task).not.toHaveBeenCalled();
		expect(fake.log).toEqual([]);
	});

	it("reports both problems when the task fails and Traefik doesn't come back", async () => {
		const fake = fakeDocker({ crashingStarts: 1 });

		const error = await run(fake, async () => {
			throw new Error("disk full");
		});

		expect(error?.message).toBe(
			"disk full. Traefik also did not start again: Traefik stopped right after starting",
		);
	});

	it("changes nothing when another restart already holds the marker", async () => {
		const fake = fakeDocker({ markerTaken: true });

		const error = await run(fake, async () => {
			fake.log.push("task");
		});

		expect(error?.message).toBe(
			"Traefik is already being restarted on this server. Try again in a moment.",
		);
		expect(fake.log).toEqual([]);
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("only runs the task when Traefik is already stopped", async () => {
		const fake = fakeDocker({ traefik: "stopped" });

		const error = await run(fake, async () => {
			fake.log.push("task");
		});

		expect(error).toBeNull();
		expect(fake.log).toEqual(["task"]);
	});

	it("treats Traefik that was already stopped or started as fine", async () => {
		const fake = fakeDocker({ notModified: true });

		const error = await run(fake, async () => {});

		expect(error).toBeNull();
		expect(fake.log).toEqual([
			"create dokploy-traefik-restarting",
			"stop traefik",
			"start traefik",
			"remove marker",
		]);
	});

	it("reports a Docker failure as it is, not as a missing Traefik", async () => {
		const fake = fakeDocker({
			inspectError: new Error("Cannot connect to the Docker daemon"),
		});

		const error = await run(fake, async () => {});

		expect(error?.message).toBe("Cannot connect to the Docker daemon");
		expect(fake.log).toEqual([]);
	});

	it("fails clearly when there is no Traefik container", async () => {
		const fake = fakeDocker({ traefik: null });

		const error = await run(fake, async () => {});

		expect(error?.message).toBe(
			"The dokploy-traefik container was not found on this server.",
		);
	});
});

describe("restoreInterruptedTraefik with a restart marker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts Traefik left stopped by an interrupted restart", async () => {
		const fake = fakeDocker({ traefik: "stopped", marker: true });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await restoreInterruptedTraefik();

		expect(fake.log).toEqual(["start traefik", "remove marker"]);
		expect(fake.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
	});

	it("only clears the marker when Traefik is already running", async () => {
		const fake = fakeDocker({ marker: true });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await restoreInterruptedTraefik();

		expect(fake.log).toEqual(["remove marker"]);
	});

	it("leaves a stopped Traefik alone when nothing was interrupted", async () => {
		const fake = fakeDocker({ traefik: "stopped" });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await restoreInterruptedTraefik();

		expect(fake.log).toEqual([]);
	});
});

describe("restoreInterruptedTraefik on a self-hosted install", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("recovers a marker left by an earlier Dokploy process straight away", async () => {
		const fake = fakeDocker({
			traefik: "stopped",
			marker: true,
			markerCreated: new Date().toISOString(),
		});
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await expect(restoreInterruptedTraefik()).resolves.toBe("done");
		expect(fake.log).toEqual(["start traefik", "remove marker"]);
	});

	it("never renames a backup over Traefik running as a Swarm service", async () => {
		const fake = fakeDocker({ traefik: null, backup: true, serviceMode: true });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await restoreInterruptedTraefik();

		expect(fake.log).toEqual([]);
	});

	it("brings the backup back when Traefik is missing and not a Swarm service", async () => {
		const fake = fakeDocker({ traefik: null, backup: true });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await restoreInterruptedTraefik();

		expect(fake.log).toEqual([
			"rename backup -> dokploy-traefik",
			"start backup",
		]);
	});

	it("never reports another process's restart as in progress", async () => {
		const fake = fakeDocker({
			marker: true,
			markerCreated: new Date().toISOString(),
		});
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await expect(isTraefikRestartInProgress()).resolves.toBe(false);
	});
});

describe("restoreInterruptedTraefik edge cases", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("accepts a Traefik that another instance already started", async () => {
		const fake = fakeDocker({
			traefik: "stopped",
			marker: true,
			notModified: true,
		});
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await expect(restoreInterruptedTraefik()).resolves.toBe("done");
		expect(fake.log).toEqual(["start traefik", "remove marker"]);
	});

	it("accepts a marker that another instance already removed", async () => {
		const fake = fakeDocker({ marker: true, markerGone: true });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await expect(restoreInterruptedTraefik()).resolves.toBe("done");
	});
});

describe("restoreInterruptedTraefikOnServers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("checks every server, and an offline or hanging one doesn't stop the others", async () => {
		const interrupted = fakeDocker({ traefik: "stopped", marker: true });
		const healthy = fakeDocker();
		const docker: Record<string, unknown> = {
			interrupted: interrupted.docker,
			healthy: healthy.docker,
		};
		mocks.getRemoteDocker.mockImplementation(async (serverId: string) => {
			if (serverId === "offline") throw new Error("connect ECONNREFUSED");
			if (serverId === "hanging") return new Promise(() => {});
			return docker[serverId];
		});
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});

		const results = restoreInterruptedTraefikOnServers([
			"offline",
			"hanging",
			"interrupted",
			"healthy",
		]);
		await vi.advanceTimersByTimeAsync(61_000);

		const { done, busy } = await results;
		expect([...done].sort()).toEqual(["healthy", "interrupted"]);
		expect(busy).toEqual([]);
		expect(interrupted.containers).toEqual([
			{ id: "traefik", name: "dokploy-traefik", running: true },
		]);
		expect(healthy.log).toEqual([]);
		expect(errors.mock.calls.map(([message]) => message)).toEqual([
			"Failed to restore Traefik on server offline:",
			"Failed to restore Traefik on server hanging:",
		]);
		expect(String(errors.mock.calls[1]?.[1])).toContain("Timed out");
	});
});
