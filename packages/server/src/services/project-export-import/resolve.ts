import { createHash } from "node:crypto";
import { IS_CLOUD } from "@dokploy/server/constants";
import type { TransferDb } from "./queries";
import type { ProposedResolution, Requirement, Snapshot } from "./types";

export const requirementKey = (requirement: Requirement): string =>
	`${requirement.kind}:${requirement.originalId ?? "null"}`;

export const buildServiceServerMap = (
	snapshot: Snapshot,
): Map<string, string | null> => {
	const map = new Map<string, string | null>();
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "server") continue;
		for (const used of requirement.usedBy) {
			if (used.field && used.field !== "serverId") continue;
			map.set(used.serviceId, requirement.originalId);
		}
	}
	return map;
};

export const buildServiceBuildServerMap = (
	snapshot: Snapshot,
): Map<string, string | null> => {
	const map = new Map<string, string | null>();
	for (const requirement of snapshot.requirements) {
		if (requirement.kind !== "server") continue;
		for (const used of requirement.usedBy) {
			if (used.field !== "buildServerId") continue;
			map.set(used.serviceId, requirement.originalId);
		}
	}
	return map;
};

export const LOCAL_SERVER_CANDIDATE_ID = "__local__";

export const buildServerIpMap = async (
	db: TransferDb,
	serverMap: Record<string, string | null>,
	organizationId: string,
): Promise<Record<string, string>> => {
	const serverIpMap: Record<string, string> = {};
	for (const serverId of new Set(Object.values(serverMap))) {
		if (!serverId) continue;
		const server = await db.query.server.findFirst({
			where: (fields, { eq }) => eq(fields.serverId, serverId),
			columns: { ipAddress: true, organizationId: true },
		});
		if (server?.ipAddress && server.organizationId === organizationId) {
			serverIpMap[serverId] = server.ipAddress;
		}
	}
	const settings = await db.query.webServerSettings.findFirst({
		orderBy: (fields, { asc }) => [asc(fields.createdAt)],
	});
	if (settings?.serverIp) serverIpMap.local = settings.serverIp;
	return serverIpMap;
};

type Candidate = { id: string; name: string };

const resolveWithCandidates = (
	match: Candidate | undefined,
	candidates: Candidate[],
	configIncluded: boolean,
): ProposedResolution => {
	if (match) {
		return { status: "resolved", targetId: match.id };
	}
	if (configIncluded) {
		return { status: "createable", candidates };
	}
	return candidates.length > 0
		? { status: "mappable", candidates }
		: { status: "missing" };
};

type Requirements = {
	[K in Requirement["kind"]]: Extract<Requirement, { kind: K }>;
};

type SimpleResolver = {
	query: keyof TransferDb["query"];
	id: (row: any) => string;
	name: (row: any) => string;
	matches: (row: any, requirement: any) => boolean;
};

const SIMPLE_RESOLVERS: Record<
	"vault" | "destination" | "registry" | "sshKey" | "network" | "certificate",
	SimpleResolver
> = {
	vault: {
		query: "vaultProvider",
		id: (row) => row.vaultProviderId,
		name: (row) => row.name,
		matches: (row, requirement: Requirements["vault"]) =>
			row.name === requirement.providerName &&
			row.providerType === requirement.providerType,
	},
	destination: {
		query: "destinations",
		id: (row) => row.destinationId,
		name: (row) => row.name,
		matches: (row, requirement: Requirements["destination"]) =>
			row.bucket === requirement.bucket &&
			row.endpoint === requirement.endpoint &&
			row.region === requirement.region,
	},
	registry: {
		query: "registry",
		id: (row) => row.registryId,
		name: (row) => row.registryName,
		matches: (row, requirement: Requirements["registry"]) =>
			row.registryUrl === requirement.registryUrl &&
			(row.imagePrefix ?? "") === requirement.imagePrefix,
	},
	sshKey: {
		query: "sshKeys",
		id: (row) => row.sshKeyId,
		name: (row) => row.name,
		matches: (row, requirement: Requirements["sshKey"]) =>
			row.publicKey === requirement.publicKey,
	},
	network: {
		query: "network",
		id: (row) => row.networkId,
		name: (row) => row.name,
		matches: (row, requirement: Requirements["network"]) =>
			row.name === requirement.name,
	},
	certificate: {
		query: "certificates",
		id: (row) => row.certificateId,
		name: (row) => row.name,
		matches: (row, requirement: Requirements["certificate"]) =>
			createHash("sha256").update(row.certificateData).digest("hex") ===
			requirement.fingerprint,
	},
};

const resolveSimple = async (
	db: TransferDb,
	requirement: Extract<Requirement, { kind: keyof typeof SIMPLE_RESOLVERS }>,
	organizationId: string,
): Promise<ProposedResolution> => {
	const resolver = SIMPLE_RESOLVERS[requirement.kind];
	const rows = await (
		db.query[resolver.query] as {
			findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
		}
	).findMany({
		where: (
			fields: Record<string, unknown>,
			{ eq }: { eq: (a: unknown, b: unknown) => unknown },
		) => eq(fields.organizationId, organizationId),
	});
	const candidates = rows.map((row) => ({
		id: resolver.id(row),
		name: resolver.name(row),
	}));
	const match = rows.find((row) => resolver.matches(row, requirement));
	return resolveWithCandidates(
		match && { id: resolver.id(match), name: resolver.name(match) },
		candidates,
		requirement.configIncluded,
	);
};

const resolveGitProvider = async (
	db: TransferDb,
	requirement: Extract<Requirement, { kind: "gitProvider" }>,
	organizationId: string,
): Promise<ProposedResolution> => {
	const rows = await db.query.gitProvider.findMany({
		where: (fields, { and, eq }) =>
			and(
				eq(fields.organizationId, organizationId),
				eq(fields.providerType, requirement.providerType),
			),
	});
	const candidates = rows.map((row) => ({
		id: row.gitProviderId,
		name: row.name,
	}));
	return candidates.length > 0
		? { status: "mappable", candidates }
		: { status: "missing" };
};

const resolveServer = async (
	db: TransferDb,
	organizationId: string,
): Promise<ProposedResolution> => {
	const rows = await db.query.server.findMany({
		where: (fields, { eq }) => eq(fields.organizationId, organizationId),
	});
	const candidates: Candidate[] = rows.map((row) => ({
		id: row.serverId,
		name: row.name,
	}));
	if (!IS_CLOUD) {
		candidates.unshift({ id: LOCAL_SERVER_CANDIDATE_ID, name: "Local server" });
	}
	return { status: "mappable", candidates };
};

const proposeForRequirement = (
	db: TransferDb,
	requirement: Requirement,
	organizationId: string,
): Promise<ProposedResolution> => {
	switch (requirement.kind) {
		case "vault":
		case "destination":
		case "registry":
		case "sshKey":
		case "network":
		case "certificate":
			return resolveSimple(db, requirement, organizationId);
		case "gitProvider":
			return resolveGitProvider(db, requirement, organizationId);
		case "server":
			return resolveServer(db, organizationId);
	}
};

export const proposeResolutions = async (
	db: TransferDb,
	snapshot: Snapshot,
	organizationId: string,
): Promise<Record<string, ProposedResolution>> => {
	const entries = await Promise.all(
		snapshot.requirements.map(
			async (requirement) =>
				[
					requirementKey(requirement),
					await proposeForRequirement(db, requirement, organizationId),
				] as const,
		),
	);
	return Object.fromEntries(entries);
};
