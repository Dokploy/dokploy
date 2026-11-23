import { diagnoseFailures } from "@dokploy/server/services/scaling/failure-diagnosis";
import {
	classifyTask,
	explainFailure,
	type SwarmNode,
	type SwarmTask,
	summarizeReplicas,
} from "@dokploy/server/services/scaling/task-status";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const minutesAgo = (minutes: number) =>
	new Date(NOW - minutes * 60_000).toISOString();

const task = (
	overrides: Partial<SwarmTask> & { state?: string },
): SwarmTask => {
	const { state = "running", ...rest } = overrides;
	return {
		ID: `task-${Math.random().toString(36).slice(2, 8)}`,
		Slot: 1,
		NodeID: "node-a",
		DesiredState: "running",
		Status: { State: state, Timestamp: minutesAgo(1) },
		...rest,
	};
};

const nodes: SwarmNode[] = [
	{
		ID: "node-a",
		Description: { Hostname: "app-1" },
		Spec: { Role: "manager", Availability: "active" },
		Status: { State: "ready" },
	},
	{
		ID: "node-b",
		Description: { Hostname: "app-2" },
		Spec: { Role: "worker", Availability: "active" },
		Status: { State: "ready" },
	},
];

describe("classifyTask", () => {
	it.each([
		["running", "running", "ready"],
		["starting", "running", "starting"],
		["preparing", "running", "starting"],
		["assigned", "running", "starting"],
		["pending", "running", "pending"],
		["new", "running", "pending"],
		["running", "shutdown", "stopping"],
		["shutdown", "shutdown", "stopped"],
		["complete", "shutdown", "completed"],
		["failed", "shutdown", "failed"],
		["rejected", "running", "failed"],
		["orphaned", "running", "failed"],
	])("state %s with desired %s is %s", (state, desired, expected) => {
		expect(
			classifyTask({ DesiredState: desired, Status: { State: state } }),
		).toBe(expected);
	});
});

describe("summarizeReplicas", () => {
	it("counts only running tasks with desired state running as receiving traffic", () => {
		const summary = summarizeReplicas({
			tasks: [
				task({ Slot: 1, state: "running" }),
				task({ Slot: 2, state: "starting" }),
				task({ Slot: 3, state: "running", DesiredState: "shutdown" }),
			],
			nodes,
			now: NOW,
		});

		expect(summary.counts).toMatchObject({
			ready: 1,
			starting: 1,
			stopping: 1,
		});
		expect(summary.replicas.map((r) => r.receivesTraffic)).toEqual([
			true,
			false,
			false,
		]);
	});

	it("sorts current replicas by slot and attaches node hostnames", () => {
		const summary = summarizeReplicas({
			tasks: [
				task({ Slot: 3, NodeID: "node-b" }),
				task({ Slot: 1, NodeID: "node-a" }),
			],
			nodes,
			now: NOW,
		});

		expect(summary.replicas.map((r) => r.slot)).toEqual([1, 3]);
		expect(summary.replicas[1]?.node).toEqual({
			id: "node-b",
			hostname: "app-2",
			state: "ready",
			availability: "active",
		});
	});

	it("reports distinct pending reasons from Swarm", () => {
		const reason = "no suitable node (insufficient resources on 2 nodes)";
		const summary = summarizeReplicas({
			tasks: [
				task({
					Slot: 1,
					state: "pending",
					NodeID: undefined,
					Status: { State: "pending", Err: reason },
				}),
				task({
					Slot: 2,
					state: "pending",
					NodeID: undefined,
					Status: { State: "pending", Err: reason },
				}),
			],
			nodes,
			now: NOW,
		});

		expect(summary.counts.pending).toBe(2);
		expect(summary.pendingReasons).toEqual([reason]);
		expect(summary.distribution).toEqual([]);
	});

	it("keeps failures inside the window, newest first", () => {
		const summary = summarizeReplicas({
			tasks: [
				task({
					DesiredState: "shutdown",
					Status: {
						State: "failed",
						Err: "unhealthy container",
						Timestamp: minutesAgo(5),
					},
				}),
				task({
					DesiredState: "shutdown",
					Status: {
						State: "failed",
						Err: "exit 1",
						Timestamp: minutesAgo(2),
					},
				}),
				task({
					DesiredState: "shutdown",
					Status: {
						State: "failed",
						Err: "old failure",
						Timestamp: minutesAgo(60),
					},
				}),
			],
			nodes,
			now: NOW,
		});

		expect(summary.recentFailures.map((r) => r.error)).toEqual([
			"exit 1",
			"unhealthy container",
		]);
		expect(summary.counts.failedRecent).toBe(2);
	});

	it("groups placed replicas by node and ignores draining ones", () => {
		const summary = summarizeReplicas({
			tasks: [
				task({ Slot: 1, NodeID: "node-a" }),
				task({ Slot: 2, NodeID: "node-b" }),
				task({ Slot: 3, NodeID: "node-b", state: "starting" }),
				task({ Slot: 4, NodeID: "node-a", DesiredState: "shutdown" }),
			],
			nodes,
			now: NOW,
		});

		expect(summary.distribution).toEqual([
			{ nodeId: "node-b", hostname: "app-2", count: 2 },
			{ nodeId: "node-a", hostname: "app-1", count: 1 },
		]);
	});
});

describe("failure causes", () => {
	const unhealthy =
		"task: non-zero exit (137): dockerexec: unhealthy container";
	const failed = (Status: SwarmTask["Status"]) =>
		summarizeReplicas({
			tasks: [task({ DesiredState: "shutdown", Status })],
			nodes,
			now: NOW,
		}).recentFailures[0];

	it("tells a failed health check from an out-of-memory kill", () => {
		const replica = failed({
			State: "failed",
			Err: unhealthy,
			Timestamp: minutesAgo(1),
			ContainerStatus: { ContainerID: "c1", ExitCode: 137 },
		});
		expect(replica).toMatchObject({ exitCode: 137, containerId: "c1" });
		expect(replica?.cause).toBe(
			"Its health check failed, so Swarm replaced it. Exit code 137 means it had not stopped by the end of its stop grace period, so Docker killed it. It did not run out of memory.",
		);
	});

	it("adds what the exited container shows", async () => {
		// The health log of a busy Next.js replica from the load test: three
		// timeouts, then a refused connection once the stop had begun.
		const docker = {
			getContainer: (id: string) => ({
				inspect: async () => {
					if (id !== "c1")
						throw Object.assign(new Error("gone"), { statusCode: 404 });
					return {
						State: {
							OOMKilled: false,
							Health: {
								Log: [
									{ ExitCode: 0, Output: "" },
									{
										ExitCode: -1,
										Output: "Health check exceeded timeout (5s)",
									},
									{
										ExitCode: -1,
										Output: "Health check exceeded timeout (5s)",
									},
									{
										ExitCode: -1,
										Output: "Health check exceeded timeout (5s)",
									},
									{
										ExitCode: 1,
										Output:
											"Connecting to 127.0.0.1:3011\nwget: can't connect to remote host (127.0.0.1): Connection refused\n",
									},
								],
							},
						},
					};
				},
			}),
		} as unknown as Parameters<typeof diagnoseFailures>[0];
		const replica = failed({
			State: "failed",
			Err: unhealthy,
			Timestamp: minutesAgo(1),
			ContainerStatus: { ContainerID: "c1", ExitCode: 137 },
		});
		const gone = { ...replica, containerId: "c2" } as typeof replica;

		const [diagnosed, missing] = await diagnoseFailures(docker, [
			replica as NonNullable<typeof replica>,
			gone as NonNullable<typeof replica>,
		]);
		expect(diagnosed?.cause).toContain(
			'Failed checks: "Health check exceeded timeout (5s)" ×3, then "Connecting to 127.0.0.1:3011 wget: can\'t connect to remote host (127.0.0.1): Connection refused".',
		);
		expect(missing?.cause).toBe(replica?.cause);
	});

	it("names an out-of-memory kill and a plain non-zero exit", () => {
		expect(
			explainFailure({
				error: "task: non-zero exit (137)",
				exitCode: 137,
				container: { oomKilled: true, failedChecks: [] },
			}),
		).toContain("ran out of memory");
		expect(
			explainFailure({
				error: "task: non-zero exit (137)",
				exitCode: 137,
				container: null,
			}),
		).toBe(
			"It was killed (signal 9): it ran out of memory, or outlasted a stop's grace period.",
		);
		expect(
			explainFailure({
				error: "task: non-zero exit (1)",
				exitCode: 1,
				container: null,
			}),
		).toBe("Its process exited with code 1. Its logs show why.");
		expect(
			explainFailure({
				error: "No such image",
				exitCode: null,
				container: null,
			}),
		).toBeNull();
	});
});
