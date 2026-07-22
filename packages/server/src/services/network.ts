import { db } from "@dokploy/server/db";
import { type apiCreateNetwork, network } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";
import { getRemoteDocker } from "../utils/servers/remote-docker";

// Networks managed by Docker/Dokploy itself that must never be imported
// or deleted through the networks UI
const RESERVED_NETWORKS = [
	"bridge",
	"host",
	"none",
	"ingress",
	"docker_gwbridge",
	"dokploy-network",
];

type DockerNetworkInfo = {
	Name: string;
	Driver: string;
	Internal?: boolean;
	Attachable?: boolean;
	Ingress?: boolean;
	EnableIPv4?: boolean;
	EnableIPv6?: boolean;
	IPAM?: {
		Driver?: string;
		Config?: Array<{
			Subnet?: string;
			Gateway?: string;
			IPRange?: string;
		}> | null;
	};
};

const isImportableDockerNetwork = (dockerNetwork: DockerNetworkInfo) =>
	!RESERVED_NETWORKS.includes(dockerNetwork.Name) &&
	!dockerNetwork.Ingress &&
	(dockerNetwork.Driver === "bridge" || dockerNetwork.Driver === "overlay");

const mapDockerNetworkToRow = (
	dockerNetwork: DockerNetworkInfo,
	organizationId: string,
	serverId: string | null,
) => ({
	name: dockerNetwork.Name,
	driver: dockerNetwork.Driver as "bridge" | "overlay",
	internal: dockerNetwork.Internal ?? false,
	attachable: dockerNetwork.Attachable ?? false,
	// Older daemons don't report EnableIPv4; IPv4 is always on there
	enableIPv4: dockerNetwork.EnableIPv4 ?? true,
	enableIPv6: dockerNetwork.EnableIPv6 ?? false,
	ipam: {
		driver: dockerNetwork.IPAM?.Driver,
		config: (dockerNetwork.IPAM?.Config ?? []).map((c) => ({
			subnet: c.Subnet,
			gateway: c.Gateway,
			ipRange: c.IPRange,
		})),
	},
	organizationId,
	serverId,
});

const findNetworksByServer = async (
	organizationId: string,
	serverId: string | null,
) => {
	return await db.query.network.findMany({
		where: and(
			eq(network.organizationId, organizationId),
			serverId ? eq(network.serverId, serverId) : isNull(network.serverId),
		),
	});
};

export const findNetworksToSync = async (
	organizationId: string,
	serverId: string | null,
) => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required",
		});
	}

	const docker = await getRemoteDocker(serverId);
	let dockerNetworks: DockerNetworkInfo[] = [];
	try {
		dockerNetworks = (await docker.listNetworks()) as DockerNetworkInfo[];
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Failed to list Docker networks",
			cause: error,
		});
	}

	const existing = await findNetworksByServer(organizationId, serverId);
	const existingNames = new Set(existing.map((row) => row.name));
	const dockerNames = new Set(dockerNetworks.map((d) => d.Name));

	const importable = dockerNetworks
		.filter(
			(dockerNetwork) =>
				isImportableDockerNetwork(dockerNetwork) &&
				!existingNames.has(dockerNetwork.Name),
		)
		.map((dockerNetwork) => ({
			name: dockerNetwork.Name,
			driver: dockerNetwork.Driver,
			internal: dockerNetwork.Internal ?? false,
			attachable: dockerNetwork.Attachable ?? false,
			subnets: (dockerNetwork.IPAM?.Config ?? [])
				.map((c) => c.Subnet)
				.filter((s): s is string => !!s),
		}));

	// Rows in Dokploy whose network no longer exists in Docker
	const missing = existing
		.filter((row) => !dockerNames.has(row.name))
		.map((row) => ({ networkId: row.networkId, name: row.name }));

	return { importable, missing };
};

export const importDockerNetworks = async (
	organizationId: string,
	serverId: string | null,
	names: string[],
) => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required",
		});
	}

	const docker = await getRemoteDocker(serverId);
	const existing = await findNetworksByServer(organizationId, serverId);
	const existingNames = new Set(existing.map((row) => row.name));

	const imported: string[] = [];
	const errors: { name: string; error: string }[] = [];

	for (const name of names) {
		if (existingNames.has(name)) {
			errors.push({ name, error: "Already imported" });
			continue;
		}
		try {
			const info = (await docker
				.getNetwork(name)
				.inspect()) as DockerNetworkInfo;
			if (!isImportableDockerNetwork(info)) {
				errors.push({ name, error: "Network is reserved or not supported" });
				continue;
			}
			await db
				.insert(network)
				.values(mapDockerNetworkToRow(info, organizationId, serverId));
			imported.push(name);
		} catch (error) {
			errors.push({
				name,
				error:
					error instanceof Error ? error.message : "Failed to inspect network",
			});
		}
	}

	return { imported, errors };
};

export const findNetworkById = async (networkId: string) => {
	const [row] = await db
		.select()
		.from(network)
		.where(eq(network.networkId, networkId))
		.limit(1);

	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Network not found",
		});
	}

	return row;
};

export const createNetwork = async (
	input: z.infer<typeof apiCreateNetwork>,
	organizationId: string,
) => {
	if (IS_CLOUD) {
		if (!input.serverId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Server is required",
			});
		}
	}

	const created = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(network)
			.values({
				...input,
				organizationId,
			})
			.returning();

		if (!row) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to create network",
			});
		}

		await createDockerNetworkFromRow(row);

		return row;
	});

	return created;
};

const createDockerNetworkFromRow = async (row: typeof network.$inferSelect) => {
	const ipam = row.ipam ?? {};
	const ipamConfig = (ipam.config ?? [])
		.map((c) => {
			const entry: Record<string, string> = {};
			if (c.subnet) entry.Subnet = c.subnet;
			if (c.gateway) entry.Gateway = c.gateway;
			if (c.ipRange) entry.IPRange = c.ipRange;
			return entry;
		})
		.filter((e) => Object.keys(e).length > 0);

	const docker = await getRemoteDocker(row.serverId ?? null);
	try {
		await docker.createNetwork({
			Name: row.name,
			Driver: row.driver,
			CheckDuplicate: true,
			Internal: row.internal,
			Attachable: row.attachable,
			// EnableIPv4 is missing from dockerode's types but supported by
			// the daemon (API >= 1.47); the body is sent as-is
			EnableIPv4: row.enableIPv4,
			EnableIPv6: row.enableIPv6,
			IPAM: {
				Driver: ipam.driver || "default",
				Config: ipamConfig.length > 0 ? ipamConfig : undefined,
			},
		} as Parameters<typeof docker.createNetwork>[0]);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Failed to create Docker network",
			cause: error,
		});
	}
};

// Re-creates the Docker network from the stored record, for records whose
// network was removed from Docker outside of Dokploy
export const recreateNetwork = async (networkId: string) => {
	const row = await findNetworkById(networkId);
	await createDockerNetworkFromRow(row);
	return row;
};

export const inspectNetwork = async (networkId: string) => {
	const row = await findNetworkById(networkId);

	const docker = await getRemoteDocker(row.serverId ?? null);
	try {
		return await docker.getNetwork(row.name).inspect();
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Failed to inspect Docker network",
			cause: error,
		});
	}
};

// Docker networks are immutable: there is no update, only create and remove.
export const removeNetwork = async (networkId: string) => {
	const row = await findNetworkById(networkId);

	const docker = await getRemoteDocker(row.serverId ?? null);
	try {
		await docker.getNetwork(row.name).remove();
	} catch (error) {
		// If the network is already gone from Docker, still clean up the DB row
		const statusCode = (error as { statusCode?: number })?.statusCode;
		if (statusCode !== 404) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					error instanceof Error
						? error.message
						: "Failed to remove Docker network",
				cause: error,
			});
		}
	}

	const [deleted] = await db
		.delete(network)
		.where(eq(network.networkId, networkId))
		.returning();

	if (!deleted) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Network not found",
		});
	}

	return deleted;
};
