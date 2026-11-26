import { db } from "@dokploy/server/db";
import { clusterNode } from "@dokploy/server/db/schema";
import { inArray } from "drizzle-orm";
import {
	isUpdateOutOfSequenceError,
	SERVICE_UPDATE_ATTEMPTS,
} from "../../utils/docker/swarm-service";
import { ScaleRejectedError } from "./scale-service";
import { POOL_LABEL, SELECTION_LABEL_PREFIX } from "./scaling-settings";
import { getScalingDocker, type ScalableApplication } from "./status";

type SwarmTarget = Pick<ScalableApplication, "serverId" | "server">;

interface SwarmNode {
	ID: string;
	Version: { Index: number };
	Spec: {
		Name?: string;
		Role?: string;
		Availability?: string;
		Labels?: Record<string, string>;
	};
	Description?: { Hostname?: string };
	Status?: { State?: string };
}

/** Set on the VMs that multi-VM networking joined, to its cluster_node row. */
const CLUSTER_NODE_LABEL = "dokploy.cluster-node";

export interface PlacementNode {
	id: string;
	hostname: string;
	/** The name given in multi-VM networking, when it has one. */
	name: string | null;
	role: string | null;
	availability: string | null;
	state: string | null;
	pool: string | null;
	/** Selection labels set on the node, one per service that chose it. */
	selections: string[];
}

export const listPlacementNodes = async (
	target: SwarmTarget,
): Promise<PlacementNode[]> => {
	const docker = await getScalingDocker(target);
	const nodes = (await docker.listNodes()) as SwarmNode[];
	const clusterNodeIds = nodes
		.map((node) => node.Spec.Labels?.[CLUSTER_NODE_LABEL])
		.filter((id): id is string => !!id);
	const names = new Map(
		clusterNodeIds.length > 0
			? (
					await db
						.select({
							clusterNodeId: clusterNode.clusterNodeId,
							name: clusterNode.name,
						})
						.from(clusterNode)
						.where(inArray(clusterNode.clusterNodeId, clusterNodeIds))
				).map((row) => [row.clusterNodeId, row.name])
			: [],
	);
	return nodes
		.map((node) => {
			const labels = node.Spec.Labels ?? {};
			const hostname = node.Description?.Hostname ?? node.ID;
			const name = names.get(labels[CLUSTER_NODE_LABEL] ?? "") ?? null;
			return {
				id: node.ID,
				hostname,
				name: name && name !== hostname ? name : null,
				role: node.Spec.Role ?? null,
				availability: node.Spec.Availability ?? null,
				state: node.Status?.State ?? null,
				pool: labels[POOL_LABEL] ?? null,
				selections: Object.entries(labels)
					.filter(
						([key, value]) =>
							key.startsWith(SELECTION_LABEL_PREFIX) && value === "true",
					)
					.map(([key]) => key),
			};
		})
		.sort((a, b) => (a.name ?? a.hostname).localeCompare(b.name ?? b.hostname));
};

/**
 * Puts `label` on exactly the given nodes of the swarm and takes it off the
 * others. Swarm keeps running tasks where they are when a label changes, so
 * this only takes effect when the service is next deployed.
 */
export const syncNodeSelection = async ({
	target,
	label,
	nodeIds,
}: {
	target: SwarmTarget;
	label: string;
	nodeIds: string[];
}) => {
	const docker = await getScalingDocker(target);
	const nodes = (await docker.listNodes()) as SwarmNode[];
	const known = new Set(nodes.map((node) => node.ID));
	const unknown = nodeIds.filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new ScaleRejectedError(
			"unknown_node",
			"A selected node is no longer in the swarm. Reload the page and choose again.",
		);
	}
	const wanted = new Set(nodeIds);
	for (const node of nodes) {
		const selected = node.Spec.Labels?.[label] === "true";
		if (selected === wanted.has(node.ID)) continue;
		for (let attempt = 1; ; attempt++) {
			const handle = docker.getNode(node.ID);
			const inspected = (await handle.inspect()) as SwarmNode;
			const labels = { ...inspected.Spec.Labels };
			if (wanted.has(node.ID)) labels[label] = "true";
			else delete labels[label];
			try {
				await handle.update({
					version: inspected.Version.Index,
					...inspected.Spec,
					Labels: labels,
				});
				break;
			} catch (error) {
				if (
					attempt >= SERVICE_UPDATE_ATTEMPTS ||
					!isUpdateOutOfSequenceError(error)
				) {
					throw error;
				}
			}
		}
	}
};

/**
 * Takes a service's selection label off every node once it no longer uses
 * one. The placement is already saved, and a label left behind selects
 * nothing, so a failure here is logged rather than reported.
 */
export const clearNodeSelection = async (
	target: SwarmTarget,
	label: string,
) => {
	try {
		await syncNodeSelection({ target, label, nodeIds: [] });
	} catch (error) {
		console.warn(`Could not remove the node label ${label}:`, error);
	}
};
