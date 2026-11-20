import {
	effectivePassword,
	isReferenceLikeValue,
	type StudioDatabase,
} from "./seed";

export type ExclusionReason =
	| "other-server"
	| "reference-like-value"
	| "network-swarm-override"
	| "no-network";

export interface OverlayNetworkRef {
	networkId: string;
	serverId: string | null;
	driver: string;
}

export interface StudioCoverage {
	covered: StudioDatabase[];
	excluded: { database: StudioDatabase; reason: ExclusionReason }[];
	requiredNetworkIds: string[];
}

// The values that become the seed's user, database, password and host. Members
// control them, and a Studio without literal mode would resolve a ${...} value
// from its own environment, so such a database is never seeded.
const hasReferenceLikeValue = (database: StudioDatabase) =>
	[
		database.databaseUser,
		database.databaseName,
		effectivePassword(database),
		database.appName,
	].some((value) => isReferenceLikeValue(value));

export const classifyStudioDatabases = (
	databases: StudioDatabase[],
	studio: { serverId: string | null },
	overlayNetworks: OverlayNetworkRef[],
): StudioCoverage => {
	// resolveServiceNetworks attaches only overlay rows, and an overlay network
	// exists only in the swarm of the server it was created on.
	const joinableNetworkIds = new Set(
		overlayNetworks
			.filter(
				(network) =>
					network.driver === "overlay" && network.serverId === studio.serverId,
			)
			.map((network) => network.networkId),
	);
	const covered: StudioDatabase[] = [];
	const excluded: StudioCoverage["excluded"] = [];
	const required = new Set<string>();
	for (const database of databases) {
		const networkIds = database.networkIds.filter((networkId) =>
			joinableNetworkIds.has(networkId),
		);
		if (database.serverId !== studio.serverId) {
			excluded.push({ database, reason: "other-server" });
		} else if (hasReferenceLikeValue(database)) {
			excluded.push({ database, reason: "reference-like-value" });
		} else if (database.hasNetworkSwarm) {
			excluded.push({ database, reason: "network-swarm-override" });
		} else if (database.detachDokployNetwork && networkIds.length === 0) {
			excluded.push({ database, reason: "no-network" });
		} else {
			covered.push(database);
			for (const networkId of networkIds) {
				required.add(networkId);
			}
		}
	}
	return {
		covered,
		excluded,
		requiredNetworkIds: [...required].sort(),
	};
};

export const exclusionMessage = (
	reason: ExclusionReason,
	serverName?: string | null,
): string => {
	switch (reason) {
		case "other-server":
			return serverName
				? `Runs on server ${serverName}. Set up a Studio on that server to manage it.`
				: "Runs on the Dokploy server. Set up a Studio on that server to manage it.";
		case "reference-like-value":
			return "Has a user, database name or password that looks like a ${...} reference, which Studio could resolve from its own environment.";
		case "network-swarm-override":
			return "Uses a custom Swarm network override, so the Studio cannot join it automatically.";
		case "no-network":
			return "Is not attached to any network.";
	}
};
