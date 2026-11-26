import {
	type CapacityContext,
	type CapacityNode,
	type CapacityTask,
	computeCapacity,
	evaluateCapacity,
	evaluateNodeEligibility,
	matchConstraint,
	type PlacementRequirements,
	parseConstraint,
} from "@dokploy/server/services/scaling/capacity";
import { describe, expect, it } from "vitest";

const CPU = 1_000_000_000;
const GIB = 1024 ** 3;

const node = (
	overrides: Partial<CapacityNode> & { id: string },
): CapacityNode => {
	const { id, ...rest } = overrides;
	return {
		ID: id,
		Description: {
			Hostname: id,
			Platform: { Architecture: "x86_64", OS: "linux" },
			Resources: { NanoCPUs: 4 * CPU, MemoryBytes: 8 * GIB },
			Engine: { Labels: {} },
		},
		Spec: { Role: "worker", Availability: "active", Labels: {} },
		Status: { State: "ready" },
		...rest,
	};
};

const task = (overrides: Partial<CapacityTask>): CapacityTask => ({
	ServiceID: "other",
	NodeID: "node-a",
	DesiredState: "running",
	Status: { State: "running" },
	Spec: { Resources: { Reservations: {} } },
	...overrides,
});

const requirements = (
	overrides: Partial<PlacementRequirements> = {},
): PlacementRequirements => ({
	cpuReservation: 0,
	memoryReservation: 0,
	cpuLimit: 0,
	memoryLimit: 0,
	constraints: [],
	maxReplicasPerNode: null,
	hostPorts: [],
	...overrides,
});

const context = (
	overrides: Partial<CapacityContext> = {},
): CapacityContext => ({
	imageOnBuildNodeOnly: false,
	hasVolumeMounts: false,
	defaultManagerPin: false,
	...overrides,
});

describe("parseConstraint", () => {
	it.each([
		[
			"node.role==manager",
			{ key: "node.role", operator: "==", value: "manager" },
		],
		[
			" node.hostname != app-1 ",
			{ key: "node.hostname", operator: "!=", value: "app-1" },
		],
		[
			"Node.Labels.Zone==eu",
			{ key: "Node.Labels.Zone", operator: "==", value: "eu" },
		],
	])("parses %j", (expression, expected) => {
		expect(parseConstraint(expression)).toEqual(expected);
	});

	it.each(["node.role", "node.role=manager", "", "== manager"])(
		"rejects %j",
		(expression) => {
			expect(parseConstraint(expression)).toBeNull();
		},
	);
});

describe("matchConstraint", () => {
	const labelled = node({
		id: "node-a",
		Spec: {
			Role: "manager",
			Availability: "active",
			Labels: { "dokploy.pool": "web" },
		},
		Description: {
			Hostname: "App-1",
			Platform: { Architecture: "aarch64", OS: "linux" },
			Engine: { Labels: { region: "eu" } },
		},
	});

	it.each([
		["node.role==manager", true],
		["node.role==worker", false],
		["node.role!=worker", true],
		["node.hostname==app-1", true],
		["node.id==node-a", true],
		["node.labels.dokploy.pool==web", true],
		["node.labels.dokploy.pool==db", false],
		["node.labels.missing==x", false],
		["node.labels.missing!=x", true],
		["engine.labels.region==eu", true],
		["node.platform.arch==aarch64", true],
		["node.platform.os==windows", false],
	])("%s is %s", (expression, expected) => {
		expect(matchConstraint(labelled, expression)).toBe(expected);
	});

	it("cannot evaluate unknown attributes or malformed expressions", () => {
		expect(matchConstraint(labelled, "node.ip==10.0.0.1")).toBe("unknown");
		expect(matchConstraint(labelled, "garbage")).toBe("unknown");
	});
});

describe("evaluateNodeEligibility", () => {
	it.each([
		[{ Status: { State: "down" } }, "Node is down"],
		[
			{ Spec: { Role: "worker", Availability: "drain" } },
			"Node availability is drain",
		],
		[
			{ Spec: { Role: "worker", Availability: "pause" } },
			"Node availability is pause",
		],
	])("excludes unusable nodes (%j)", (overrides, reason) => {
		expect(
			evaluateNodeEligibility(node({ id: "node-a", ...overrides }), []),
		).toEqual({ eligibility: "ineligible", reason });
	});

	it("excludes nodes that fail a constraint and flags ones it cannot evaluate", () => {
		const worker = node({ id: "node-a" });
		expect(evaluateNodeEligibility(worker, ["node.role==manager"])).toEqual({
			eligibility: "ineligible",
			reason: "Does not match node.role==manager",
		});
		expect(evaluateNodeEligibility(worker, ["node.ip==1.2.3.4"])).toEqual({
			eligibility: "unknown",
			reason: "Cannot evaluate node.ip==1.2.3.4",
		});
	});
});

describe("label name case", () => {
	const zoned = node({
		id: "node-a",
		Spec: { Role: "manager", Availability: "active", Labels: { Zone: "eu" } },
		Description: { Engine: { Labels: { Region: "west" } } },
	});

	it("matches the label name case-sensitively, like swarmkit", () => {
		expect(matchConstraint(zoned, "node.labels.Zone==eu")).toBe(true);
		expect(matchConstraint(zoned, "node.labels.zone==eu")).toBe(false);
		expect(matchConstraint(zoned, "engine.labels.Region==west")).toBe(true);
		expect(matchConstraint(zoned, "engine.labels.region==west")).toBe(false);
	});

	it("matches attribute names, label prefixes and values case-insensitively", () => {
		expect(matchConstraint(zoned, "NODE.LABELS.Zone==EU")).toBe(true);
		expect(matchConstraint(zoned, "Node.Role==Manager")).toBe(true);
		expect(matchConstraint(zoned, "Engine.Labels.Region==WEST")).toBe(true);
	});
});

describe("computeCapacity", () => {
	it("counts every reservation still held, except the app's own current replicas", () => {
		const report = computeCapacity({
			nodes: [node({ id: "node-a" })],
			tasks: [
				task({ Spec: { Resources: { Reservations: { NanoCPUs: CPU } } } }),
				task({
					ServiceID: "svc-app",
					Spec: { Resources: { Reservations: { NanoCPUs: CPU } } },
				}),
				task({
					Status: { State: "failed" },
					Spec: { Resources: { Reservations: { NanoCPUs: CPU } } },
				}),
				task({
					DesiredState: "shutdown",
					Status: { State: "shutdown" },
					Spec: { Resources: { Reservations: { NanoCPUs: CPU } } },
				}),
			],
			serviceId: "svc-app",
			requirements: requirements({ cpuReservation: CPU }),
		});

		const [nodeA] = report.nodes;
		expect(nodeA?.cpu).toEqual({
			total: 4 * CPU,
			reservedByOthers: CPU,
			available: 3 * CPU,
		});
		expect(nodeA?.appReplicas).toBe(1);
		expect(nodeA?.slots).toBe(3);
		expect(report.placeable).toBe(3);
	});

	it("keeps counting tasks that are stopping or not yet running", () => {
		const report = computeCapacity({
			nodes: [node({ id: "node-a" })],
			tasks: [
				task({
					DesiredState: "shutdown",
					Status: { State: "running" },
					Spec: { Resources: { Reservations: { NanoCPUs: CPU } } },
				}),
				task({
					DesiredState: "ready",
					Status: { State: "preparing" },
					Spec: { Resources: { Reservations: { NanoCPUs: CPU } } },
				}),
				task({
					ServiceID: "svc-app",
					DesiredState: "shutdown",
					Status: { State: "running" },
					Spec: { Resources: { Reservations: { NanoCPUs: CPU } } },
				}),
			],
			serviceId: "svc-app",
			requirements: requirements({ cpuReservation: CPU }),
		});

		expect(report.nodes[0]?.cpu.reservedByOthers).toBe(3 * CPU);
		expect(report.nodes[0]?.appReplicas).toBe(0);
		expect(report.placeable).toBe(1);
	});

	it("never treats limits as reservations", () => {
		const report = computeCapacity({
			nodes: [node({ id: "node-a" })],
			tasks: [task({ Spec: { Resources: { Reservations: {} } } })],
			serviceId: null,
			requirements: requirements({ cpuLimit: 8 * CPU, memoryLimit: 64 * GIB }),
		});

		expect(report.nodes[0]?.slots).toBeNull();
		expect(report.placeable).toBeNull();
	});

	it("takes the tightest of CPU, memory, per-node cap and host ports", () => {
		const nodes = [node({ id: "node-a" }), node({ id: "node-b" })];
		const cpuAndMemory = computeCapacity({
			nodes,
			tasks: [],
			serviceId: null,
			requirements: requirements({
				cpuReservation: CPU,
				memoryReservation: 3 * GIB,
			}),
		});
		expect(cpuAndMemory.nodes.map((n) => n.slots)).toEqual([2, 2]);
		expect(cpuAndMemory.placeable).toBe(4);

		const perNode = computeCapacity({
			nodes,
			tasks: [],
			serviceId: null,
			requirements: requirements({ maxReplicasPerNode: 1 }),
		});
		expect(perNode.placeable).toBe(2);

		const hostPorts = computeCapacity({
			nodes,
			tasks: [],
			serviceId: null,
			requirements: requirements({ hostPorts: [8080] }),
		});
		expect(hostPorts.placeable).toBe(2);
	});

	it("places nothing on ineligible nodes and reports unknown ones separately", () => {
		const report = computeCapacity({
			nodes: [
				node({ id: "node-a", Status: { State: "down" } }),
				node({ id: "node-b" }),
				node({ id: "node-c" }),
			],
			tasks: [],
			serviceId: null,
			requirements: requirements({
				cpuReservation: CPU,
				constraints: ["node.hostname!=node-c", "node.labels.zone!=x"],
			}),
		});

		expect(report.nodes.map((n) => [n.id, n.eligibility, n.slots])).toEqual([
			["node-a", "ineligible", 0],
			["node-b", "eligible", 4],
			["node-c", "ineligible", 0],
		]);
		expect(report.eligibleNodes).toBe(1);
		expect(report.placeable).toBe(4);
	});
});

describe("evaluateCapacity", () => {
	const twoNodes = (reqs: Partial<PlacementRequirements> = {}) =>
		computeCapacity({
			nodes: [node({ id: "node-a" }), node({ id: "node-b" })],
			tasks: [],
			serviceId: null,
			requirements: requirements({ cpuReservation: 2 * CPU, ...reqs }),
		});
	const codes = (result: ReturnType<typeof evaluateCapacity>) =>
		result.warnings.map((warning) => warning.code);

	it("fits when the slots cover the request", () => {
		const result = evaluateCapacity(twoNodes(), 4, context());
		expect(result.fit).toBe("fits");
		expect(codes(result)).not.toContain("insufficient_capacity");
	});

	it("reports how many replicas fit when they do not", () => {
		const result = evaluateCapacity(twoNodes(), 5, context());
		expect(result.fit).toBe("insufficient");
		expect(result.warnings[0]).toMatchObject({
			code: "insufficient_capacity",
			severity: "warning",
			message: expect.stringContaining("Only 4 of 5 replicas fit"),
		});
	});

	it("is unknown rather than insufficient when some nodes cannot be evaluated", () => {
		const report = twoNodes({ constraints: ["node.ip==1.2.3.4"] });
		const result = evaluateCapacity(report, 3, context());
		expect(result.fit).toBe("unknown");
		expect(codes(result)).toContain("capacity_unknown");
	});

	it("warns when no node is eligible", () => {
		const report = twoNodes({ constraints: ["node.role==manager"] });
		const result = evaluateCapacity(report, 1, context());
		expect(result.fit).toBe("insufficient");
		expect(codes(result)).toEqual(["no_eligible_nodes"]);
	});

	it("explains that limits reserve nothing", () => {
		const report = twoNodes({ cpuReservation: 0, cpuLimit: CPU });
		const warning = evaluateCapacity(report, 2, context()).warnings.find(
			(w) => w.code === "no_reservations",
		);
		expect(warning?.message).toContain("Limits cap what a replica may use");
	});

	it("flags multi-node problems only when more than one node is eligible", () => {
		const multi = evaluateCapacity(
			twoNodes(),
			2,
			context({ imageOnBuildNodeOnly: true, hasVolumeMounts: true }),
		);
		expect(codes(multi)).toEqual(
			expect.arrayContaining(["image_not_distributed", "volumes_per_node"]),
		);

		const single = evaluateCapacity(
			twoNodes({ constraints: ["node.hostname==node-a"] }),
			1,
			context({ imageOnBuildNodeOnly: true, hasVolumeMounts: true }),
		);
		expect(codes(single)).not.toContain("image_not_distributed");
		expect(codes(single)).not.toContain("volumes_per_node");
	});

	it("mentions host-mode ports, the manager pin and unavailable nodes", () => {
		const report = computeCapacity({
			nodes: [
				node({
					id: "node-a",
					Spec: { Role: "manager", Availability: "active" },
				}),
				node({ id: "node-b", Spec: { Role: "worker", Availability: "drain" } }),
			],
			tasks: [],
			serviceId: null,
			requirements: requirements({ hostPorts: [8080] }),
		});
		const result = evaluateCapacity(
			report,
			2,
			context({ defaultManagerPin: true }),
		);
		expect(codes(result)).toEqual(
			expect.arrayContaining([
				"host_ports",
				"manager_pin",
				"unavailable_nodes",
			]),
		);
	});
});
