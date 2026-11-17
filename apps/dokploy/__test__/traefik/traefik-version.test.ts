import {
	getTraefikOverview,
	parseTraefikImageVersion,
	pullTraefikImage,
	readEnvironmentVariableList,
	readEnvironmentVariables,
} from "@dokploy/server/services/settings";
import { TRAEFIK_VERSION } from "@dokploy/server/setup/traefik-setup";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	getRemoteDocker: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	sleep: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const startedAt = "2026-10-23T03:00:00.000000000Z";

const mockOutput = (exec: typeof mocks.execAsync, stdout: string) => {
	exec.mockResolvedValueOnce({ stdout: `${stdout}\n`, stderr: "" });
};

describe("parseTraefikImageVersion", () => {
	it.each([
		["traefik:v3.6.25", "3.6.25"],
		["traefik:v3.7.16@sha256:abc123", "3.7.16"],
		["docker.io/library/traefik:3.7", "3.7.0"],
		["localhost:5000/traefik:v3.6.25", "3.6.25"],
		["traefik:latest", null],
		["traefik", null],
		["registry.local:5000/traefik", null],
	])("parses %s as %s", (image, expected) => {
		expect(parseTraefikImageVersion(image)).toBe(expected);
	});
});

describe("getTraefikOverview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reports a running container that is older than the recommended version", async () => {
		mockOutput(mocks.execAsync, `traefik:v3.6.25|running|${startedAt}`);

		await expect(getTraefikOverview()).resolves.toEqual({
			state: "running",
			startedAt,
			image: "traefik:v3.6.25",
			currentVersion: "3.6.25",
			recommendedVersion: TRAEFIK_VERSION,
			versionStatus: "outdated",
		});
		expect(mocks.execAsync).toHaveBeenCalledOnce();
		expect(mocks.execAsync).toHaveBeenCalledWith(
			expect.stringContaining(
				"docker container inspect dokploy-traefik --format '{{.Config.Image}}|{{.State.Status}}|{{.State.StartedAt}}'",
			),
		);
	});

	it("reads a swarm service's image and state from the same task", async () => {
		mockOutput(
			mocks.execAsync,
			`traefik:v${TRAEFIK_VERSION}@sha256:abc123|running|${startedAt}`,
		);

		const overview = await getTraefikOverview();

		expect(overview.versionStatus).toBe("up-to-date");
		expect(overview.state).toBe("running");
		expect(mocks.execAsync).toHaveBeenCalledWith(
			expect.stringContaining(
				"docker service ps dokploy-traefik --filter desired-state=running",
			),
		);
		expect(mocks.execAsync).toHaveBeenCalledWith(
			expect.stringContaining(
				`docker inspect "$task" --format '{{.Spec.ContainerSpec.Image}}|{{.Status.State}}|{{.Status.Timestamp}}'`,
			),
		);
	});

	it.each([
		["exited", "2026-10-16T09:18:25Z"],
		["created", "0001-01-01T00:00:00Z"],
	])("has no start time when Traefik is %s", async (state, startedAt) => {
		mockOutput(mocks.execAsync, `traefik:v3.6.25|${state}|${startedAt}`);

		const overview = await getTraefikOverview();

		expect(overview.state).toBe(state);
		expect(overview.startedAt).toBeNull();
	});

	it("reports newer and never asks for a downgrade", async () => {
		mockOutput(mocks.execAsync, "traefik:v99.0.0|running|");

		const overview = await getTraefikOverview();

		expect(overview.versionStatus).toBe("newer");
	});

	it("reports unknown when the tag has no version", async () => {
		mockOutput(mocks.execAsync, "traefik:latest|running|");

		const overview = await getTraefikOverview();

		expect(overview.versionStatus).toBe("unknown");
		expect(overview.image).toBe("traefik:latest");
	});

	it.each([
		"registry.example.com/traefik:v3.6.25",
		"ghcr.io/acme/traefik-plugins:v3.6.25",
	])("leaves the custom image %s alone", async (image) => {
		mockOutput(mocks.execAsync, `${image}|running|${startedAt}`);

		const overview = await getTraefikOverview();

		expect(overview.versionStatus).toBe("custom");
	});

	it("reports not-found when the container is missing", async () => {
		mockOutput(mocks.execAsync, "missing");

		const overview = await getTraefikOverview();

		expect(overview.versionStatus).toBe("not-found");
		expect(overview.state).toBeNull();
	});

	it("fails instead of reporting not-found when Docker is unreachable", async () => {
		mockOutput(mocks.execAsync, "docker-unavailable");

		await expect(getTraefikOverview()).rejects.toThrow(
			"Docker is not reachable on this server",
		);
	});

	it("fails instead of reporting not-found when SSH fails", async () => {
		mocks.execAsyncRemote.mockRejectedValueOnce(
			new Error("connect ECONNREFUSED"),
		);

		await expect(getTraefikOverview("server-a")).rejects.toThrow(
			"ECONNREFUSED",
		);
	});

	it("gives up instead of hanging when Docker or SSH never answers", async () => {
		vi.useFakeTimers();
		try {
			mocks.execAsync.mockReturnValueOnce(new Promise(() => {}));

			const overview = getTraefikOverview();
			const assertion = expect(overview).rejects.toThrow("Timed out");
			await vi.advanceTimersByTimeAsync(30_000);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	it("reads a remote server's Traefik over SSH", async () => {
		mockOutput(mocks.execAsyncRemote, `traefik:v3.6.25|running|${startedAt}`);

		const overview = await getTraefikOverview("server-a");

		expect(overview.versionStatus).toBe("outdated");
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-a",
			expect.any(String),
		);
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});
});

describe("pullTraefikImage", () => {
	const image = { inspect: vi.fn() };
	const docker = {
		getImage: vi.fn(() => image),
		pull: vi.fn(),
		modem: { followProgress: vi.fn() },
	};
	const finishDownload = (events: { error?: string }[] = []) => {
		docker.modem.followProgress.mockImplementationOnce(
			(_stream: unknown, done: (error: Error | null, out: unknown[]) => void) =>
				done(null, events),
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getRemoteDocker.mockResolvedValue(docker);
		docker.pull.mockResolvedValue("stream");
	});

	it("skips the download when the image is already there", async () => {
		image.inspect.mockResolvedValueOnce({});

		await pullTraefikImage();

		expect(docker.getImage).toHaveBeenCalledWith(`traefik:v${TRAEFIK_VERSION}`);
		expect(docker.pull).not.toHaveBeenCalled();
	});

	it("waits for the whole download, then checks the image exists", async () => {
		image.inspect
			.mockRejectedValueOnce(new Error("No such image"))
			.mockResolvedValueOnce({});
		finishDownload([{ status: "Downloading" } as { error?: string }]);

		await pullTraefikImage();

		expect(docker.pull).toHaveBeenCalledWith(`traefik:v${TRAEFIK_VERSION}`);
		expect(docker.modem.followProgress).toHaveBeenCalledOnce();
		expect(image.inspect).toHaveBeenCalledTimes(2);
	});

	it("fails on a registry error reported inside the download stream", async () => {
		image.inspect.mockRejectedValueOnce(new Error("No such image"));
		finishDownload([
			{ error: "toomanyrequests: You have reached your pull rate limit" },
		]);

		await expect(pullTraefikImage()).rejects.toThrow("toomanyrequests");
	});

	it("fails when the registry refuses the tag", async () => {
		image.inspect.mockRejectedValueOnce(new Error("No such image"));
		docker.pull.mockRejectedValueOnce(new Error("manifest unknown"));

		await expect(pullTraefikImage()).rejects.toThrow("manifest unknown");
		expect(docker.modem.followProgress).not.toHaveBeenCalled();
	});

	it("downloads on the remote server's Docker", async () => {
		image.inspect.mockResolvedValueOnce({});

		await pullTraefikImage("server-a");

		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("server-a");
	});

	it("stops waiting on a stalled download before proxies cut the request", async () => {
		vi.useFakeTimers();
		try {
			image.inspect.mockRejectedValueOnce(new Error("No such image"));
			docker.modem.followProgress.mockImplementationOnce(() => {});

			const pull = pullTraefikImage("server-a");
			const assertion = expect(pull).rejects.toThrow("90 seconds");
			await vi.advanceTimersByTimeAsync(90_000);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("readEnvironmentVariableList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the container's env exactly as Docker stores it", async () => {
		const env = ["TOKEN=abc#def", 'QUOTED="kept"', "MULTI=line1\nline2"];
		mockOutput(mocks.execAsync, "standalone");
		mockOutput(mocks.execAsync, JSON.stringify(env));

		await expect(
			readEnvironmentVariableList("dokploy-traefik"),
		).resolves.toEqual(env);
	});

	it("returns an empty list when the container has no env", async () => {
		mockOutput(mocks.execAsync, "standalone");
		mockOutput(mocks.execAsync, "null");

		await expect(
			readEnvironmentVariableList("dokploy-traefik"),
		).resolves.toEqual([]);
	});

	it("keeps readEnvironmentVariables returning the joined text", async () => {
		mockOutput(mocks.execAsync, "standalone");
		mockOutput(mocks.execAsync, JSON.stringify(["A=1", "B=2"]));

		await expect(readEnvironmentVariables("dokploy-traefik")).resolves.toBe(
			"A=1\nB=2",
		);
	});
});
