import {
	ServiceConvergenceError,
	waitForSwarmServiceConvergence,
} from "@dokploy/server/utils/docker/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SwarmTask = {
	DesiredState: string;
	CreatedAt?: string;
	Status: {
		State: string;
		Err?: string | null;
		Timestamp?: string;
		ContainerStatus?: { ContainerID?: string };
	};
};

const { inspectMock, listTasksMock, getServiceMock, getRemoteDockerMock } =
	vi.hoisted(() => {
		const inspect = vi.fn<() => Promise<unknown>>();
		const getService = vi.fn(() => ({ inspect }));
		const listTasks = vi.fn<(opts: unknown) => Promise<SwarmTask[]>>();
		const getRemoteDocker = vi.fn(async () => ({
			getService,
			listTasks,
		}));
		return {
			inspectMock: inspect,
			listTasksMock: listTasks,
			getServiceMock: getService,
			getRemoteDockerMock: getRemoteDocker,
		};
	});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const task = (opts: {
	desiredState: string;
	state: string;
	err?: string;
	timestamp?: string;
	createdAt?: string;
}): SwarmTask => ({
	DesiredState: opts.desiredState,
	CreatedAt: opts.createdAt,
	Status: {
		State: opts.state,
		Err: opts.err,
		Timestamp: opts.timestamp,
	},
});

const ONE_REPLICA = {
	Spec: { Mode: { Replicated: { Replicas: 1 } } },
};

// Returns a listTasks implementation that pops snapshots in order and repeats
// the last snapshot forever afterwards (the convergence loop polls repeatedly).
const queueSnapshots = (snapshots: SwarmTask[][]) => {
	let i = 0;
	return () => {
		const snapshot =
			i < snapshots.length ? snapshots[i++] : snapshots[snapshots.length - 1];
		return Promise.resolve(snapshot ?? []);
	};
};

const converge = (
	appName: string,
	timeoutMs = 300,
	intervalMs = 10,
): Promise<void> =>
	waitForSwarmServiceConvergence(appName, "server-id", {
		timeoutMs,
		intervalMs,
	});

const expectConvergenceFailure = async (
	appName: string,
	snapshots: SwarmTask[][],
	timeoutMs = 300,
): Promise<ServiceConvergenceError> => {
	listTasksMock.mockImplementation(queueSnapshots(snapshots));
	let thrown: ServiceConvergenceError | undefined;
	try {
		await converge(appName, timeoutMs);
	} catch (error) {
		if (error instanceof ServiceConvergenceError) thrown = error;
		else throw error;
	}
	if (!thrown)
		throw new Error("expected waitForSwarmServiceConvergence to throw");
	return thrown;
};

describe("waitForSwarmServiceConvergence", () => {
	beforeEach(() => {
		inspectMock.mockReset();
		listTasksMock.mockReset();
		getServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		inspectMock.mockResolvedValue(ONE_REPLICA);
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			listTasks: listTasksMock,
		});
	});

	it("returns success once runningTasksCount reaches desiredTasksCount", async () => {
		listTasksMock.mockImplementation(
			queueSnapshots([[task({ desiredState: "running", state: "running" })]]),
		);

		await expect(converge("mysql-test-app")).resolves.toBeUndefined();
		expect(listTasksMock).toHaveBeenCalledTimes(1);
	});

	it("surfaces the failed task's Status.Err in the convergence error", async () => {
		// Hard failure: the failed task's DesiredState has already been flipped
		// to "shutdown" by swarm's restart supervisor; a brand-new replacement
		// (DesiredState "running", Status.State "new") exists alongside it.
		const err = "container exited: command not found (exit code 127)";
		const snapshots: SwarmTask[][] = [
			[
				task({
					desiredState: "shutdown",
					state: "failed",
					err,
					timestamp: "2026-09-07T12:00:00.000Z",
					createdAt: "2026-09-07T12:00:00.000Z",
				}),
				task({
					desiredState: "running",
					state: "new",
					timestamp: "2026-09-07T12:00:01.000Z",
					createdAt: "2026-09-07T12:00:01.000Z",
				}),
			],
		];

		const error = await expectConvergenceFailure("mysql-test-app", snapshots);

		expect(error).toBeInstanceOf(ServiceConvergenceError);
		expect(error.message).toContain(err);
		expect(error.message).toContain("0/1 tasks running");
		expect(error.message).not.toContain("last state: new");
	});

	it("respects the timeout when no task ever reaches running (hard failure: bad command)", async () => {
		const err = 'exec: "bad-cmd": executable file not found';
		const snapshots: SwarmTask[][] = [
			[
				task({
					desiredState: "shutdown",
					state: "failed",
					err,
					timestamp: "2026-09-07T12:00:00.000Z",
					createdAt: "2026-09-07T12:00:00.000Z",
				}),
				task({
					desiredState: "running",
					state: "new",
					timestamp: "2026-09-07T12:00:01.000Z",
					createdAt: "2026-09-07T12:00:01.000Z",
				}),
			],
		];

		const error = await expectConvergenceFailure(
			"mysql-test-app",
			snapshots,
			400,
		);

		expect(error).toBeInstanceOf(ServiceConvergenceError);
		expect(error.message).toContain(err);
		expect(error.message).toContain("did not converge within 400ms");
	});

	it("does not regress transient recoveries (still returns within timeout)", async () => {
		// Poll 1: a previous task has failed (shutdown) and a replacement is
		// spinning up ("new"). Poll 2: the replacement reaches "running".
		const snapshots: SwarmTask[][] = [
			[
				task({
					desiredState: "shutdown",
					state: "failed",
					err: "previous transient error",
					timestamp: "2026-09-07T11:59:58.000Z",
					createdAt: "2026-09-07T11:59:58.000Z",
				}),
				task({
					desiredState: "running",
					state: "new",
					timestamp: "2026-09-07T11:59:59.000Z",
					createdAt: "2026-09-07T11:59:59.000Z",
				}),
			],
			[
				task({
					desiredState: "running",
					state: "running",
					timestamp: "2026-09-07T12:00:00.000Z",
					createdAt: "2026-09-07T12:00:00.000Z",
				}),
			],
		];
		listTasksMock.mockImplementation(queueSnapshots(snapshots));

		const start = Date.now();
		await expect(converge("mysql-test-app", 5000)).resolves.toBeUndefined();
		const elapsed = Date.now() - start;

		// Returns well before the 5s timeout — transient recovery is honored.
		expect(elapsed).toBeLessThan(5000);
	});

	it("surfaces the most recent failed task's error when historical failures exist", async () => {
		// A stale failed task from a prior deploy appears FIRST in the listTasks
		// response; the current failed task (different error) appears second.
		// The convergence error must surface the most recent failure, not the
		// stale one that happens to be first in the array.
		const staleErr = "bind: address already in use";
		const currentErr = 'exec: "bad-cmd": executable file not found';
		const snapshots: SwarmTask[][] = [
			[
				task({
					desiredState: "shutdown",
					state: "failed",
					err: staleErr,
					timestamp: "2026-08-31T00:00:00.000Z",
					createdAt: "2026-08-31T00:00:00.000Z",
				}),
				task({
					desiredState: "shutdown",
					state: "failed",
					err: currentErr,
					timestamp: "2026-09-07T12:00:00.000Z",
					createdAt: "2026-09-07T12:00:00.000Z",
				}),
				task({
					desiredState: "running",
					state: "new",
					timestamp: "2026-09-07T12:00:01.000Z",
					createdAt: "2026-09-07T12:00:01.000Z",
				}),
			],
		];

		const error = await expectConvergenceFailure("mysql-test-app", snapshots);

		expect(error.message).toContain(currentErr);
		expect(error.message).not.toContain(staleErr);
	});

	it("surfaces the most recent failed task regardless of array order", async () => {
		const staleErr = "bind: address already in use";
		const currentErr = 'exec: "bad-cmd": executable file not found';
		const stale = task({
			desiredState: "shutdown",
			state: "failed",
			err: staleErr,
			timestamp: "2026-08-31T00:00:00.000Z",
			createdAt: "2026-08-31T00:00:00.000Z",
		});
		const current = task({
			desiredState: "shutdown",
			state: "failed",
			err: currentErr,
			timestamp: "2026-09-07T12:00:00.000Z",
			createdAt: "2026-09-07T12:00:00.000Z",
		});
		const replacement = task({
			desiredState: "running",
			state: "new",
			timestamp: "2026-09-07T12:00:01.000Z",
			createdAt: "2026-09-07T12:00:01.000Z",
		});

		// Stale-first ordering.
		let error = await expectConvergenceFailure("mysql-test-app", [
			[stale, current, replacement],
		]);
		expect(error.message).toContain(currentErr);
		expect(error.message).not.toContain(staleErr);

		// Current-first ordering — same expected result.
		error = await expectConvergenceFailure("mysql-test-app", [
			[current, stale, replacement],
		]);
		expect(error.message).toContain(currentErr);
		expect(error.message).not.toContain(staleErr);
	});

	it("does not let a transitional poll overwrite a previously captured failure error", async () => {
		// Reproduces the real-Swarm timing window: poll 1 observes a failed
		// task (DesiredState "shutdown", Status.State "failed") carrying the
		// real container error; poll 2 lands in a transitional window where
		// the replacement task is at Status.State "starting" and no task has
		// Status.State "failed" yet. The surfaced error must be the real
		// container error captured on poll 1, not the transitional "starting"
		// state observed on the final poll.
		const realErr = 'exec: "/bad-cmd": executable file not found';
		const failedTask: SwarmTask = {
			DesiredState: "shutdown",
			CreatedAt: "2026-09-07T12:00:00.000Z",
			Status: {
				State: "failed",
				Err: realErr,
				Timestamp: "2026-09-07T12:00:00.000Z",
			},
		};
		const transitionalReplacement: SwarmTask = {
			DesiredState: "running",
			CreatedAt: "2026-09-07T12:00:02.000Z",
			Status: {
				State: "starting",
				Timestamp: "2026-09-07T12:00:02.000Z",
			},
		};
		const snapshots: SwarmTask[][] = [[failedTask], [transitionalReplacement]];

		const error = await expectConvergenceFailure(
			"mysql-test-app",
			snapshots,
			400,
		);

		expect(error).toBeInstanceOf(ServiceConvergenceError);
		expect(error.message).toContain(realErr);
		expect(error.message).not.toMatch(/last state: starting\)/i);
	});

	it("falls back to the transitional state when no failure was ever observed", async () => {
		// Sanity check: if no failed task is ever seen, the convergence error
		// still reports the last observed task state (no spurious "unknown"
		// once a state was seen).
		const snapshots: SwarmTask[][] = [
			[
				{
					DesiredState: "running",
					CreatedAt: "2026-09-07T12:00:00.000Z",
					Status: { State: "preparing", Timestamp: "2026-09-07T12:00:00.000Z" },
				},
			],
		];
		const error = await expectConvergenceFailure(
			"mysql-test-app",
			snapshots,
			300,
		);
		expect(error.message).toContain("last state: preparing)");
	});
});
