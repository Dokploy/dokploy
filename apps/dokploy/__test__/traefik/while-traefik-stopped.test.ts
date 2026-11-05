import {
	restoreInterruptedTraefik,
	whileTraefikStopped,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

interface FakeOptions {
	traefik?: "running" | "stopped" | null;
	marker?: boolean;
	notModified?: boolean;
	startError?: Error;
	inspectError?: Error;
}

const statusError = (message: string, statusCode: number) =>
	Object.assign(new Error(message), { statusCode });

const fakeDocker = ({
	traefik = "running",
	marker = false,
	notModified = false,
	startError,
	inspectError,
}: FakeOptions = {}) => {
	const log: string[] = [];
	const containers: { id: string; name: string; running: boolean }[] = [];
	if (traefik) {
		containers.push({
			id: "traefik",
			name: "dokploy-traefik",
			running: traefik === "running",
		});
	}
	if (marker) {
		containers.push({
			id: "marker",
			name: "dokploy-traefik-restarting",
			running: false,
		});
	}
	let createdWith: unknown;

	const find = (ref: string) => {
		const found = containers.find((c) => c.id === ref || c.name === ref);
		if (!found) throw statusError(`No such container: ${ref}`, 404);
		return found;
	};

	const container = (ref: string) => ({
		inspect: async () => {
			if (inspectError && ref === "dokploy-traefik") throw inspectError;
			const c = find(ref);
			return {
				Id: c.id,
				Image: `sha256:${c.id}-image`,
				State: { Running: c.running },
			};
		},
		stop: async () => {
			const c = find(ref);
			log.push(`stop ${c.id}`);
			c.running = false;
			if (notModified) throw statusError("container already stopped", 304);
		},
		start: async () => {
			const c = find(ref);
			log.push(`start ${c.id}`);
			if (startError) throw startError;
			c.running = true;
			if (notModified) throw statusError("container already started", 304);
		},
		remove: async () => {
			const c = find(ref);
			log.push(`remove ${c.id}`);
			containers.splice(containers.indexOf(c), 1);
		},
	});

	const docker = {
		getContainer: (ref: string) => container(ref),
		createContainer: async (settings: { name: string; Image: string }) => {
			createdWith = settings;
			containers.push({ id: "marker", name: settings.name, running: false });
			log.push(`create ${settings.name}`);
			return container("marker");
		},
	};

	return { docker, log, containers, createdWith: () => createdWith };
};

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
		task: () => Promise<void>,
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
