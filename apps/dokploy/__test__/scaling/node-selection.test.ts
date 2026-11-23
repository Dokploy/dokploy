import { db } from "@dokploy/server/db";
import {
	listPlacementNodes,
	syncNodeSelection,
} from "@dokploy/server/services/scaling/node-selection";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeNode {
	ID: string;
	Version: { Index: number };
	Spec: { Role: string; Availability: string; Labels: Record<string, string> };
	Description: { Hostname: string };
	Status: { State: string };
}

const swarm = vi.hoisted(() => ({
	nodes: [] as FakeNode[],
	updates: [] as {
		id: string;
		version: number;
		labels: Record<string, string>;
	}[],
	conflicts: 0,
}));

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

vi.mock("@dokploy/server/services/scaling/status", async (importOriginal) => ({
	...(await importOriginal<object>()),
	getScalingDocker: async () => ({
		listNodes: async () => copy(swarm.nodes),
		getNode: (id: string) => ({
			inspect: async () => copy(swarm.nodes.find((node) => node.ID === id)),
			update: async (spec: {
				version: number;
				Labels: Record<string, string>;
			}) => {
				if (swarm.conflicts > 0) {
					swarm.conflicts--;
					throw Object.assign(new Error("rpc error: update out of sequence"), {
						statusCode: 500,
					});
				}
				const node = swarm.nodes.find((candidate) => candidate.ID === id);
				if (!node) throw new Error("no such node");
				swarm.updates.push({ id, version: spec.version, labels: spec.Labels });
				node.Spec.Labels = spec.Labels;
				node.Version.Index++;
			},
		}),
	}),
}));

const node = (
	id: string,
	hostname: string,
	labels: Record<string, string> = {},
	role = "worker",
): FakeNode => ({
	ID: id,
	Version: { Index: 10 },
	Spec: { Role: role, Availability: "active", Labels: labels },
	Description: { Hostname: hostname },
	Status: { State: "ready" },
});

const target = { serverId: null, server: null };
const label = "dokploy.placement.shop_web";

describe("syncNodeSelection", () => {
	beforeEach(() => {
		swarm.updates = [];
		swarm.conflicts = 0;
		swarm.nodes = [
			node("n1", "manager", { "dokploy.pool": "web" }, "manager"),
			node("n2", "vm-2", { [label]: "true", "dokploy.pool": "web" }),
			node("n3", "vm-3", { [label]: "true" }),
		];
	});

	it("labels exactly the chosen nodes and keeps their other labels", async () => {
		await syncNodeSelection({ target, label, nodeIds: ["n1", "n2"] });

		expect(swarm.updates.map((update) => update.id)).toEqual(["n1", "n3"]);
		expect(swarm.nodes.map((candidate) => candidate.Spec.Labels)).toEqual([
			{ "dokploy.pool": "web", [label]: "true" },
			{ [label]: "true", "dokploy.pool": "web" },
			{},
		]);
	});

	it("takes the label off every node when none is chosen", async () => {
		await syncNodeSelection({ target, label, nodeIds: [] });

		expect(
			swarm.nodes.some((candidate) => label in candidate.Spec.Labels),
		).toBe(false);
	});

	it("changes nothing when a chosen node is no longer in the swarm", async () => {
		await expect(
			syncNodeSelection({ target, label, nodeIds: ["n1", "gone"] }),
		).rejects.toMatchObject({ reason: "unknown_node" });
		expect(swarm.updates).toEqual([]);
	});

	it("re-reads the node and retries when Swarm reports a stale version", async () => {
		swarm.conflicts = 1;

		await syncNodeSelection({ target, label, nodeIds: ["n1", "n2", "n3"] });

		expect(swarm.updates).toEqual([
			expect.objectContaining({ id: "n1", version: 10 }),
		]);
	});
});

describe("listPlacementNodes", () => {
	it("reports each node's pool, selections and multi-VM name, sorted by name", async () => {
		swarm.nodes = [
			node("n2", "ip-172-31-2-29", {
				"dokploy.cluster-node": "cn-2",
				"dokploy.pool": "ec2",
				[label]: "true",
				"dokploy.placement.other": "false",
			}),
			node("n1", "temporal", { "dokploy.cluster-node": "cn-1" }, "manager"),
		];
		vi.mocked(db.select).mockReturnValueOnce({
			from: () => ({
				where: async () => [
					{ clusterNodeId: "cn-1", name: "temporal" },
					{ clusterNodeId: "cn-2", name: "worker-1" },
				],
			}),
		} as never);

		expect(await listPlacementNodes(target)).toEqual([
			{
				id: "n1",
				hostname: "temporal",
				name: null,
				role: "manager",
				availability: "active",
				state: "ready",
				pool: null,
				selections: [],
			},
			{
				id: "n2",
				hostname: "ip-172-31-2-29",
				name: "worker-1",
				role: "worker",
				availability: "active",
				state: "ready",
				pool: "ec2",
				selections: [label],
			},
		]);
	});
});
