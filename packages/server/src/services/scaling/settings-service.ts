import { db } from "@dokploy/server/db";
import {
	applications,
	type UpdateConfigSwarm,
} from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import {
	type CapacityApplication,
	invalidateApplicationCapacity,
	requirementsFromApplication,
} from "./capacity-service";
import { recordScalingEvent } from "./events";
import { clearNodeSelection, syncNodeSelection } from "./node-selection";
import {
	applyPlacementSelection,
	fromUpdateConfig,
	type PlacementSelection,
	type RolloutSettings,
	readPlacementSettings,
	selectionLabelFor,
	toRollbackConfig,
	toUpdateConfig,
} from "./scaling-settings";
import type { ScalableApplication } from "./status";

export interface SettingsApplication extends CapacityApplication {
	updateConfigSwarm: UpdateConfigSwarm | null;
}

export const getScalingSettings = (application: SettingsApplication) => ({
	rollout: fromUpdateConfig(application.updateConfigSwarm),
	placement: readPlacementSettings(
		application.placementSwarm,
		application.mounts.length > 0,
	),
	hostPorts: requirementsFromApplication(application).hostPorts,
	serverId: application.serverId,
});

export const updateRolloutSettings = async ({
	applicationId,
	settings,
	userId,
}: {
	applicationId: string;
	settings: RolloutSettings;
	userId: string | null;
}) => {
	const { before, after } = await db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				updateConfigSwarm: applications.updateConfigSwarm,
				rollbackConfigSwarm: applications.rollbackConfigSwarm,
			})
			.from(applications)
			.where(eq(applications.applicationId, applicationId))
			.for("update");
		const next = {
			updateConfigSwarm: toUpdateConfig(settings),
			rollbackConfigSwarm: toRollbackConfig(row?.rollbackConfigSwarm, settings),
		};
		await tx
			.update(applications)
			.set(next)
			.where(eq(applications.applicationId, applicationId));
		return {
			before: {
				updateConfigSwarm: row?.updateConfigSwarm ?? null,
				rollbackConfigSwarm: row?.rollbackConfigSwarm ?? null,
			},
			after: next,
		};
	});

	await recordScalingEvent({
		applicationId,
		source: "manual",
		action: "policy_change",
		reason: "Rollout strategy updated. Applies on the next deploy.",
		userId,
		details: { setting: "rollout", before, after },
	});
	return after;
};

export const updatePlacementSettings = async ({
	application,
	selection,
	userId,
}: {
	application: Pick<
		ScalableApplication,
		"applicationId" | "appName" | "serverId" | "server"
	>;
	selection: PlacementSelection & { nodeIds?: string[] };
	userId: string | null;
}) => {
	const { applicationId } = application;
	const label = selectionLabelFor(application.appName);
	const { nodeIds = [], ...choice } = selection;
	if (choice.nodeTarget === "nodes") {
		await syncNodeSelection({ target: application, label, nodeIds });
	}
	const resolved: PlacementSelection = {
		...choice,
		selectionLabel: choice.nodeTarget === "nodes" ? label : null,
	};
	// Merge against the stored value under a row lock so two saves from this
	// card cannot lose each other's changes. The raw Swarm Settings form writes
	// the whole placement without merging and can still overwrite this one.
	const { before, after } = await db.transaction(async (tx) => {
		const [row] = await tx
			.select({ placementSwarm: applications.placementSwarm })
			.from(applications)
			.where(eq(applications.applicationId, applicationId))
			.for("update");
		const placementSwarm = applyPlacementSelection(
			row?.placementSwarm,
			resolved,
		);
		await tx
			.update(applications)
			.set({ placementSwarm })
			.where(eq(applications.applicationId, applicationId));
		return { before: row?.placementSwarm ?? null, after: placementSwarm };
	});

	if (
		choice.nodeTarget !== "nodes" &&
		readPlacementSettings(before, false).selectionLabel === label
	) {
		await clearNodeSelection(application, label);
	}
	invalidateApplicationCapacity(applicationId);
	await recordScalingEvent({
		applicationId,
		source: "manual",
		action: "policy_change",
		reason: "Placement updated. Applies on the next deploy.",
		userId,
		details: { setting: "placement", before, after },
	});
	return after;
};
