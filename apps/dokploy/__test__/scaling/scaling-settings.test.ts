import {
	apiUpdateApplication,
	apiUpdatePlacement,
} from "@dokploy/server/db/schema";
import {
	applyPlacementSelection,
	DEFAULT_ROLLOUT,
	fromUpdateConfig,
	readPlacementSettings,
	selectionLabelFor,
	toUpdateConfig,
} from "@dokploy/server/services/scaling/scaling-settings";
import { describe, expect, it } from "vitest";

const SECOND = 1_000_000_000;

describe("rollout settings", () => {
	it("maps the structured settings onto Swarm's update config", () => {
		expect(
			toUpdateConfig({
				strategy: "stop-first",
				batchSize: 2,
				delaySeconds: 10,
				monitorSeconds: 30,
				failureAction: "pause",
				maxFailureRatioPercent: 25,
			}),
		).toEqual({
			Order: "stop-first",
			Parallelism: 2,
			Delay: 10 * SECOND,
			Monitor: 30 * SECOND,
			FailureAction: "pause",
			MaxFailureRatio: 0.25,
		});
	});

	it("round-trips through the stored config", () => {
		const settings = {
			strategy: "start-first" as const,
			batchSize: 3,
			delaySeconds: 5,
			monitorSeconds: 20,
			failureAction: "rollback" as const,
			maxFailureRatioPercent: 10,
		};
		expect(fromUpdateConfig(toUpdateConfig(settings))).toEqual({
			...settings,
			isDefault: false,
		});
	});

	it("reports Dokploy's defaults when nothing is stored", () => {
		expect(fromUpdateConfig(null)).toEqual({
			...DEFAULT_ROLLOUT,
			isDefault: true,
		});
	});

	it("reads configs written by the raw Swarm settings form", () => {
		expect(
			fromUpdateConfig({ Parallelism: 0, Order: "", FailureAction: "oops" }),
		).toMatchObject({
			strategy: "stop-first",
			batchSize: 0,
			failureAction: "pause",
			monitorSeconds: 5,
		});
	});
});

describe("readPlacementSettings", () => {
	it("is any node when nothing is stored and there are no mounts", () => {
		expect(readPlacementSettings(null, false)).toEqual({
			nodeTarget: "any",
			hostname: null,
			pool: null,
			selectionLabel: null,
			maxReplicasPerNode: 0,
			otherConstraints: [],
			usesDefaultManagerPin: false,
		});
	});

	it("reports the manager pin Dokploy applies to apps with mounts", () => {
		expect(readPlacementSettings(null, true)).toMatchObject({
			nodeTarget: "managers",
			usesDefaultManagerPin: true,
		});
	});

	it("separates the node target from other constraints", () => {
		expect(
			readPlacementSettings(
				{
					Constraints: [
						"node.labels.zone==eu",
						"node.hostname == app-2",
						"node.role!=manager",
					],
					MaxReplicas: 2,
				},
				true,
			),
		).toEqual({
			nodeTarget: "node",
			hostname: "app-2",
			pool: null,
			selectionLabel: null,
			maxReplicasPerNode: 2,
			otherConstraints: ["node.labels.zone==eu", "node.role!=manager"],
			usesDefaultManagerPin: false,
		});
	});
});

describe("applyPlacementSelection", () => {
	const existing = {
		Constraints: ["node.labels.zone==eu", "node.role==manager"],
		Preferences: [{ Spread: { SpreadDescriptor: "node.labels.zone" } }],
		Platforms: [{ Architecture: "amd64", OS: "linux" }],
		MaxReplicas: 3,
	};

	it("replaces only the node target and keeps everything else", () => {
		expect(
			applyPlacementSelection(existing, {
				nodeTarget: "node",
				hostname: "app-3",
				pool: null,
				maxReplicasPerNode: 2,
			}),
		).toEqual({
			Constraints: ["node.labels.zone==eu", "node.hostname==app-3"],
			Preferences: existing.Preferences,
			Platforms: existing.Platforms,
			MaxReplicas: 2,
		});
	});

	it("stores an explicit empty placement for any node so the manager pin does not return", () => {
		expect(
			applyPlacementSelection(null, {
				nodeTarget: "any",
				hostname: null,
				pool: null,
				maxReplicasPerNode: 0,
			}),
		).toEqual({ Constraints: [] });
	});

	it("owns only one node-target constraint and keeps any other pin", () => {
		const pinned = {
			Constraints: ["node.role==manager", "node.hostname==n1"],
		};
		expect(readPlacementSettings(pinned, false)).toMatchObject({
			nodeTarget: "node",
			hostname: "n1",
			otherConstraints: ["node.role==manager"],
		});
		expect(
			applyPlacementSelection(pinned, {
				nodeTarget: "node",
				hostname: "n1",
				pool: null,
				maxReplicasPerNode: 2,
			}),
		).toEqual({
			Constraints: ["node.role==manager", "node.hostname==n1"],
			MaxReplicas: 2,
		});
	});

	it("targets a pool and keeps the other constraints and preferences", () => {
		const placement = applyPlacementSelection(existing, {
			nodeTarget: "pool",
			hostname: null,
			pool: "eu-web",
			maxReplicasPerNode: 0,
		});
		expect(placement).toEqual({
			Constraints: ["node.labels.zone==eu", "node.labels.dokploy.pool==eu-web"],
			Preferences: existing.Preferences,
			Platforms: existing.Platforms,
		});
		expect(readPlacementSettings(placement, false)).toMatchObject({
			nodeTarget: "pool",
			pool: "eu-web",
			otherConstraints: ["node.labels.zone==eu"],
		});
	});

	it("prefers a hostname pin over a pool, and a pool over a role", () => {
		expect(
			readPlacementSettings(
				{
					Constraints: [
						"node.role==worker",
						"node.labels.dokploy.pool==db",
						"node.hostname==vm-1",
					],
				},
				false,
			),
		).toMatchObject({ nodeTarget: "node", hostname: "vm-1" });
		expect(
			readPlacementSettings(
				{ Constraints: ["node.role==worker", "node.labels.dokploy.pool==db"] },
				false,
			),
		).toMatchObject({
			nodeTarget: "pool",
			pool: "db",
			otherConstraints: ["node.role==worker"],
		});
		// Label names are case-sensitive, so this is not the pool label.
		expect(
			readPlacementSettings(
				{ Constraints: ["node.labels.Dokploy.Pool==db"] },
				false,
			),
		).toMatchObject({ nodeTarget: "any" });
	});

	it("drops the per-node cap when set to zero", () => {
		expect(
			applyPlacementSelection(existing, {
				nodeTarget: "workers",
				hostname: null,
				pool: null,
				maxReplicasPerNode: 0,
			}),
		).not.toHaveProperty("MaxReplicas");
	});
});

describe("several nodes", () => {
	const label = selectionLabelFor("shop_web");

	it("names the label after the Swarm service", () => {
		expect(label).toBe("dokploy.placement.shop_web");
	});

	it("pins the service to its label and keeps other constraints", () => {
		expect(
			applyPlacementSelection(
				{ Constraints: ["node.labels.zone==eu", "node.role==worker"] },
				{
					nodeTarget: "nodes",
					hostname: null,
					pool: null,
					selectionLabel: label,
					maxReplicasPerNode: 1,
				},
			),
		).toEqual({
			Constraints: [
				"node.labels.zone==eu",
				"node.labels.dokploy.placement.shop_web==true",
			],
			MaxReplicas: 1,
		});
	});

	it("reads the label back as a node selection, ranked after a hostname pin", () => {
		expect(
			readPlacementSettings(
				{
					Constraints: [
						"node.labels.dokploy.pool==web",
						`node.labels.${label}==true`,
					],
				},
				false,
			),
		).toMatchObject({
			nodeTarget: "nodes",
			selectionLabel: label,
			otherConstraints: ["node.labels.dokploy.pool==web"],
		});
		expect(
			readPlacementSettings(
				{ Constraints: [`node.labels.${label}==true`, "node.hostname==a"] },
				false,
			),
		).toMatchObject({ nodeTarget: "node", hostname: "a" });
	});

	it("does not treat other values of the label as a selection", () => {
		expect(
			readPlacementSettings(
				{ Constraints: [`node.labels.${label}==false`] },
				false,
			),
		).toMatchObject({ nodeTarget: "any", selectionLabel: null });
	});

	it("requires at least one node, and accepts only node IDs", () => {
		const parse = (fields: Record<string, unknown>) =>
			apiUpdatePlacement.safeParse({
				applicationId: "app-1",
				nodeTarget: "nodes",
				hostname: null,
				maxReplicasPerNode: 0,
				...fields,
			}).success;
		expect(parse({ nodeIds: ["abc123"] })).toBe(true);
		expect(parse({ nodeIds: [] })).toBe(false);
		expect(parse({})).toBe(false);
		expect(parse({ nodeIds: ["a;rm -rf"] })).toBe(false);
	});
});

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const CPU2 = "2000000000";

describe("input validation", () => {
	const update = (fields: Record<string, unknown>) =>
		apiUpdateApplication.safeParse({ applicationId: "app-1", ...fields });

	it("accepts whole numbers, empty values and null for resources", () => {
		for (const value of ["500000000", "", null, undefined]) {
			expect(update({ cpuLimit: value }).success).toBe(true);
		}
	});

	it("rejects resource values Docker cannot use", () => {
		expect(update({ cpuLimit: "abc" }).success).toBe(false);
		expect(update({ memoryLimit: "1.5" }).success).toBe(false);
		expect(update({ memoryReservation: "-1" }).success).toBe(false);
	});

	it("rejects a reservation above its limit", () => {
		const result = update({
			memoryReservation: String(2 * GIB),
			memoryLimit: String(GIB),
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(["memoryReservation"]);
		expect(update({ cpuReservation: CPU2, cpuLimit: CPU2 }).success).toBe(true);
		expect(update({ cpuReservation: CPU2 }).success).toBe(true);
	});

	it("treats a limit of 0 as no limit", () => {
		expect(update({ cpuReservation: CPU2, cpuLimit: "0" }).success).toBe(true);
	});

	it("reports invalid values instead of throwing when both of a pair are sent", () => {
		for (const fields of [
			{ cpuReservation: "abc", cpuLimit: CPU2 },
			{ cpuReservation: CPU2, cpuLimit: "abc" },
			{ memoryReservation: "1.5", memoryLimit: String(GIB) },
		]) {
			expect(() => update(fields)).not.toThrow();
			expect(update(fields).success).toBe(false);
		}
	});

	it("enforces Swarm's minimums and the exact integer range", () => {
		expect(update({ cpuLimit: "999999" }).success).toBe(false);
		expect(update({ cpuLimit: "1000000" }).success).toBe(true);
		expect(update({ memoryLimit: String(4 * MIB - 1) }).success).toBe(false);
		expect(update({ memoryLimit: String(4 * MIB) }).success).toBe(true);
		expect(update({ memoryLimit: "0" }).success).toBe(true);
		expect(
			update({ memoryLimit: String(Number.MAX_SAFE_INTEGER) }).success,
		).toBe(true);
		expect(update({ memoryLimit: "9007199254740992" }).success).toBe(false);
	});

	it("requires a valid hostname when targeting one node", () => {
		const placement = (fields: Record<string, unknown>) =>
			apiUpdatePlacement.safeParse({
				applicationId: "app-1",
				nodeTarget: "node",
				maxReplicasPerNode: 0,
				...fields,
			}).success;

		expect(placement({ hostname: "app-1.internal" })).toBe(true);
		expect(placement({ hostname: null })).toBe(false);
		expect(placement({ hostname: "app-1 || node.role==worker" })).toBe(false);
		expect(placement({ hostname: "x==y" })).toBe(false);
	});
});
