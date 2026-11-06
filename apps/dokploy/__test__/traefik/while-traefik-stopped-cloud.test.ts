import {
	isTraefikRestartInProgress,
	restoreInterruptedTraefik,
	whileTraefikStopped,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDocker } from "./fake-traefik-docker";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	IS_CLOUD: true,
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const minutesAgo = (minutes: number) =>
	new Date(Date.now() - minutes * 60_000).toISOString();

describe("Traefik restarts in cloud, where several Dokploy instances run", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("leaves a recent marker from another instance alone", async () => {
		const fake = fakeDocker({
			traefik: "stopped",
			marker: true,
			markerCreated: minutesAgo(1),
		});
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await expect(restoreInterruptedTraefik("server-1")).resolves.toBe("busy");
		expect(fake.log).toEqual([]);
	});

	it("recovers a marker from another instance once it is too old to be active", async () => {
		const fake = fakeDocker({
			traefik: "stopped",
			marker: true,
			markerCreated: minutesAgo(10),
		});
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		await expect(restoreInterruptedTraefik("server-1")).resolves.toBe("done");
		expect(fake.log).toEqual(["start traefik", "remove marker"]);
	});

	it("refuses to stop Traefik while another instance is restarting it", async () => {
		vi.useFakeTimers();
		const fake = fakeDocker({ marker: true, markerCreated: minutesAgo(1) });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		const task = vi.fn();

		const result = whileTraefikStopped("server-1", task).then(
			() => null,
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();

		expect((await result)?.message).toBe(
			"Traefik is already being restarted on this server. Try again in a moment.",
		);
		expect(task).not.toHaveBeenCalled();
		expect(fake.log).toEqual([]);
	});

	it("reports another instance's recent restart as in progress, and an old one as not", async () => {
		const recent = fakeDocker({ marker: true, markerCreated: minutesAgo(1) });
		const old = fakeDocker({ marker: true, markerCreated: minutesAgo(10) });
		const none = fakeDocker();

		mocks.getRemoteDocker.mockResolvedValueOnce(recent.docker);
		await expect(isTraefikRestartInProgress("server-1")).resolves.toBe(true);
		mocks.getRemoteDocker.mockResolvedValueOnce(old.docker);
		await expect(isTraefikRestartInProgress("server-1")).resolves.toBe(false);
		mocks.getRemoteDocker.mockResolvedValueOnce(none.docker);
		await expect(isTraefikRestartInProgress("server-1")).resolves.toBe(false);
	});

	it("recovers its own marker straight away, since its own job has finished", async () => {
		vi.useFakeTimers();
		const fake = fakeDocker({ crashingStarts: 99 });
		mocks.getRemoteDocker.mockResolvedValue(fake.docker);

		const first = whileTraefikStopped("server-1", async () => {}).catch(
			() => null,
		);
		await vi.runAllTimersAsync();
		await first;
		expect(fake.containers.map((c) => c.name)).toContain(
			"dokploy-traefik-restarting",
		);

		const status = restoreInterruptedTraefik("server-1");
		await vi.runAllTimersAsync();

		await expect(status).resolves.toBe("done");
		expect(fake.containers.map((c) => c.name)).not.toContain(
			"dokploy-traefik-restarting",
		);
	});
});
