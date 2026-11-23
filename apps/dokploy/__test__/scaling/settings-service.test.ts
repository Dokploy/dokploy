import { db } from "@dokploy/server/db";
import {
	updatePlacementSettings,
	updateRolloutSettings,
} from "@dokploy/server/services/scaling/settings-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selection = vi.hoisted(() => ({
	sync: vi.fn(async () => undefined),
	clear: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/services/scaling/node-selection", () => ({
	syncNodeSelection: selection.sync,
	clearNodeSelection: selection.clear,
}));

const application = {
	applicationId: "app-1",
	appName: "web-app",
	serverId: null,
	server: null,
};

const insertedEvents: Record<string, unknown>[] = [];
const stored: {
	placementSwarm: unknown;
	updateConfigSwarm: unknown;
	rollbackConfigSwarm: unknown;
} = {
	placementSwarm: null,
	updateConfigSwarm: null,
	rollbackConfigSwarm: null,
};
const lockMock = vi.fn();

const updateChain = () => ({
	set: (values: Record<string, unknown>) => ({
		where: async () => {
			Object.assign(stored, values);
		},
	}),
});

describe("scaling settings service", () => {
	beforeEach(() => {
		insertedEvents.length = 0;
		lockMock.mockReset();
		selection.sync.mockClear();
		selection.clear.mockClear();
		stored.placementSwarm = {
			Constraints: ["node.labels.zone==eu", "node.role==manager"],
		};
		stored.updateConfigSwarm = null;
		stored.rollbackConfigSwarm = {
			Parallelism: 1,
			Order: "start-first",
			Delay: 7,
		};
		vi.mocked(db.update).mockImplementation(updateChain as never);
		vi.mocked(db.insert).mockReturnValue({
			values: (event: Record<string, unknown>) => {
				insertedEvents.push(event);
				return { returning: async () => [event] };
			},
		} as never);
		(db as unknown as { transaction: unknown }).transaction = vi.fn(
			async (run: (tx: unknown) => Promise<unknown>) =>
				run({
					select: () => ({
						from: () => ({
							where: () => ({
								for: async (mode: string) => {
									lockMock(mode);
									return [{ ...stored }];
								},
							}),
						}),
					}),
					update: updateChain,
				}),
		);
	});

	it("labels the chosen nodes and pins the app to its own label", async () => {
		const after = await updatePlacementSettings({
			application,
			selection: {
				nodeTarget: "nodes",
				hostname: null,
				pool: null,
				nodeIds: ["n1", "n3"],
				maxReplicasPerNode: 0,
			},
			userId: "user-1",
		});

		expect(selection.sync).toHaveBeenCalledWith({
			target: application,
			label: "dokploy.placement.web-app",
			nodeIds: ["n1", "n3"],
		});
		expect(after.Constraints).toEqual([
			"node.labels.zone==eu",
			"node.labels.dokploy.placement.web-app==true",
		]);
		expect(selection.clear).not.toHaveBeenCalled();
	});

	it("takes the label off the nodes when the app stops using several nodes", async () => {
		stored.placementSwarm = {
			Constraints: ["node.labels.dokploy.placement.web-app==true"],
		};

		await updatePlacementSettings({
			application,
			selection: {
				nodeTarget: "any",
				hostname: null,
				pool: null,
				maxReplicasPerNode: 0,
			},
			userId: "user-1",
		});

		expect(selection.sync).not.toHaveBeenCalled();
		expect(selection.clear).toHaveBeenCalledWith(
			application,
			"dokploy.placement.web-app",
		);
		expect(stored.placementSwarm).toEqual({ Constraints: [] });
	});

	it("merges placement into the stored value under a row lock", async () => {
		const after = await updatePlacementSettings({
			application,
			selection: {
				nodeTarget: "workers",
				hostname: null,
				pool: null,
				maxReplicasPerNode: 2,
			},
			userId: "user-1",
		});

		expect(lockMock).toHaveBeenCalledWith("update");
		expect(after).toEqual({
			Constraints: ["node.labels.zone==eu", "node.role==worker"],
			MaxReplicas: 2,
		});
		expect(stored.placementSwarm).toEqual(after);
		expect(insertedEvents).toEqual([
			expect.objectContaining({
				action: "policy_change",
				userId: "user-1",
				details: {
					setting: "placement",
					before: {
						Constraints: ["node.labels.zone==eu", "node.role==manager"],
					},
					after,
				},
			}),
		]);
	});

	it("stores the rollout, aligns the rollback order and records exact before/after", async () => {
		const rollout = await updateRolloutSettings({
			applicationId: "app-1",
			settings: {
				strategy: "stop-first",
				batchSize: 1,
				delaySeconds: 0,
				monitorSeconds: 5,
				failureAction: "rollback",
				maxFailureRatioPercent: 0,
			},
			userId: "user-1",
		});

		expect(lockMock).toHaveBeenCalledWith("update");
		expect(stored.updateConfigSwarm).toEqual(rollout.updateConfigSwarm);
		expect(rollout.updateConfigSwarm).toMatchObject({
			Order: "stop-first",
			Parallelism: 1,
		});
		expect(stored.rollbackConfigSwarm).toEqual({
			Parallelism: 1,
			Order: "stop-first",
			Delay: 7,
		});
		expect(insertedEvents[0]).toMatchObject({
			action: "policy_change",
			details: {
				setting: "rollout",
				before: {
					updateConfigSwarm: null,
					rollbackConfigSwarm: {
						Parallelism: 1,
						Order: "start-first",
						Delay: 7,
					},
				},
				after: rollout,
			},
		});
	});
});
