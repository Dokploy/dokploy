import { db } from "@dokploy/server/db";
import {
	type apiCreateNetwork,
	applications,
	environments,
	libsql,
	mariadb,
	mongo,
	mysql,
	network,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, arrayContains, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export type NetworkUsage = {
	type:
		| "application"
		| "libsql"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "postgres"
		| "redis";
	id: string;
	name: string;
}[];

const collectErrorText = (
	value: unknown,
	seen = new WeakSet<object>(),
): string[] => {
	if (value == null) return [];
	if (typeof value === "string") return [value];
	if (typeof value === "number" || typeof value === "boolean") {
		return [String(value)];
	}
	if (typeof value !== "object") return [String(value)];
	if (seen.has(value)) return [];
	seen.add(value);

	const record = value as Record<string, unknown>;
	const parts: string[] = [];
	for (const key of [
		"name",
		"message",
		"reason",
		"statusMessage",
		"code",
		"detail",
		"constraint",
	]) {
		parts.push(...collectErrorText(record[key], seen));
	}
	for (const key of ["cause", "error", "errors", "json", "body", "data"]) {
		parts.push(...collectErrorText(record[key], seen));
	}
	if (parts.length === 0) {
		try {
			parts.push(JSON.stringify(value));
		} catch {
			parts.push(String(value));
		}
	}
	return parts;
};

export const getNetworkErrorMessage = (error: unknown): string =>
	Array.from(new Set(collectErrorText(error).filter(Boolean))).join(" ");

export const isDuplicateNetworkNameError = (error: unknown): boolean =>
	/unique|duplicate|already exist|already in use|is already in use|network_name_serverId_idx|network .*exists/i.test(
		getNetworkErrorMessage(error),
	);

export const findNetworkById = async (
	networkId: string,
	organizationId?: string,
) => {
	const row = await db.query.network.findFirst({
		where: organizationId
			? and(
					eq(network.networkId, networkId),
					eq(network.organizationId, organizationId),
				)
			: eq(network.networkId, networkId),
	});
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Network not found",
		});
	}
	return row;
};

export const findNetworksByOrganizationId = async (organizationId: string) =>
	db
		.select()
		.from(network)
		.where(eq(network.organizationId, organizationId))
		.orderBy(desc(network.createdAt));

export const resolveNetworkNamesForResource = async (
	networkIds: string[] | null | undefined,
	serverId: string | null | undefined,
	organizationId: string,
): Promise<string[]> => {
	if (!networkIds || networkIds.length === 0) return [];
	const rows = await db
		.select({
			name: network.name,
			serverId: network.serverId,
			driver: network.driver,
		})
		.from(network)
		.where(
			and(
				inArray(network.networkId, networkIds),
				eq(network.organizationId, organizationId),
			),
		);
	const target = serverId ?? null;
	// Apps + DBs deploy as Docker Swarm services. Swarm rejects bridge networks
	// at deploy with HTTP 403 ("only networks scoped to the swarm can be used").
	// Drop non-overlay here so a bad attachment fails open (skipped) rather than
	// breaking every deploy of the resource.
	const usable = rows.filter(
		(row) => (row.serverId ?? null) === target && row.driver === "overlay",
	);
	if (usable.length < rows.length) {
		console.warn(
			`[networks] skipped ${rows.length - usable.length} attached network(s) not usable by this resource (non-overlay or different server); deploy continues without them`,
		);
	}
	return usable.map((row) => row.name);
};

export const assertNetworkIdsAttachableToResource = async (
	networkIds: string[] | null | undefined,
	organizationId: string,
	serverId: string | null | undefined,
): Promise<string[]> => {
	if (!networkIds || networkIds.length === 0) return [];
	const unique = Array.from(new Set(networkIds));
	const rows = await db
		.select({
			id: network.networkId,
			serverId: network.serverId,
			driver: network.driver,
		})
		.from(network)
		.where(
			and(
				inArray(network.networkId, unique),
				eq(network.organizationId, organizationId),
			),
		);
	const target = serverId ?? null;
	const invalidTarget = rows.some(
		(row) => (row.serverId ?? null) !== target || row.driver !== "overlay",
	);
	if (rows.length !== unique.length || invalidTarget) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "One or more networks cannot be attached to this resource",
		});
	}
	return unique;
};

export const createNetwork = async (
	input: z.infer<typeof apiCreateNetwork>,
	organizationId: string,
) => {
	if (IS_CLOUD && !input.serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required in cloud mode",
		});
	}

	// Docker failure rolls back the row so we never persist a ghost record.
	return db.transaction(async (tx) => {
		let row: typeof network.$inferSelect;
		try {
			const [inserted] = await tx
				.insert(network)
				.values({ ...input, organizationId })
				.returning();
			if (!inserted) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to insert network",
				});
			}
			row = inserted;
		} catch (error) {
			if (error instanceof TRPCError) throw error;
			if (isDuplicateNetworkNameError(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `A network named "${input.name}" already exists on this server`,
				});
			}
			throw error;
		}

		const ipam = row.ipam ?? {};
		const ipamConfig = (ipam.config ?? [])
			.map((c) => {
				const entry: Record<string, string> = {};
				if (c.subnet) entry.Subnet = c.subnet;
				if (c.gateway) entry.Gateway = c.gateway;
				if (c.ipRange) entry.IPRange = c.ipRange;
				return entry;
			})
			.filter((entry) => Object.keys(entry).length > 0);

		const docker = await getRemoteDocker(row.serverId ?? null);
		try {
			await docker.createNetwork({
				Name: row.name,
				Driver: row.driver,
				Internal: row.internal,
				Attachable: row.attachable,
				Ingress: row.ingress,
				EnableIPv6: row.enableIPv6,
				IPAM: {
					Driver: ipam.driver ?? "default",
					Config: ipamConfig.length > 0 ? ipamConfig : undefined,
				},
				// Ownership tag. Operators wanting to spare these on host
				// cleanup should use:
				//   docker network prune --filter "label!=dokploy.managed=true"
				// Plain `docker network prune` (no filter) still removes them
				// — Docker does not auto-protect by label.
				Labels: {
					"dokploy.managed": "true",
					"dokploy.organizationId": organizationId,
				},
			});
		} catch (error) {
			if (isDuplicateNetworkNameError(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `A network named "${input.name}" already exists on this server`,
					cause: error,
				});
			}
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					error instanceof Error
						? `Docker rejected network creation: ${error.message}`
						: "Docker rejected network creation",
				cause: error,
			});
		}

		return row;
	});
};

export const findResourcesUsingNetwork = async (
	networkId: string,
	organizationId: string,
): Promise<NetworkUsage> => {
	const target = await db.query.network.findFirst({
		where: and(
			eq(network.networkId, networkId),
			eq(network.organizationId, organizationId),
		),
	});
	if (!target) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Network not found" });
	}
	// Org-scope through environment → project; resource tables have no orgId column.
	const orgEnvIds = db
		.select({ id: environments.environmentId })
		.from(environments)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(eq(projects.organizationId, organizationId));
	const probes = [
		{
			type: "application" as const,
			table: applications,
			idCol: applications.applicationId,
			envCol: applications.environmentId,
		},
		{
			type: "libsql" as const,
			table: libsql,
			idCol: libsql.libsqlId,
			envCol: libsql.environmentId,
		},
		{
			type: "mariadb" as const,
			table: mariadb,
			idCol: mariadb.mariadbId,
			envCol: mariadb.environmentId,
		},
		{
			type: "mongo" as const,
			table: mongo,
			idCol: mongo.mongoId,
			envCol: mongo.environmentId,
		},
		{
			type: "mysql" as const,
			table: mysql,
			idCol: mysql.mysqlId,
			envCol: mysql.environmentId,
		},
		{
			type: "postgres" as const,
			table: postgres,
			idCol: postgres.postgresId,
			envCol: postgres.environmentId,
		},
		{
			type: "redis" as const,
			table: redis,
			idCol: redis.redisId,
			envCol: redis.environmentId,
		},
	];
	const results: NetworkUsage = [];
	for (const { type, table, idCol, envCol } of probes) {
		const rows = await db
			.select({ id: idCol, name: table.name })
			.from(table)
			.where(
				and(
					arrayContains(table.networkIds, [networkId]),
					inArray(envCol, orgEnvIds),
				),
			);
		for (const r of rows) results.push({ type, id: r.id, name: r.name });
	}
	return results;
};

export const removeNetworkById = async (
	networkId: string,
	organizationId: string,
) => {
	const target = await db.query.network.findFirst({
		where: and(
			eq(network.networkId, networkId),
			eq(network.organizationId, organizationId),
		),
	});
	if (!target) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Network not found",
		});
	}

	const usage = await findResourcesUsingNetwork(networkId, organizationId);
	if (usage.length > 0) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Network "${target.name}" is attached to ${usage.length} resource(s). Detach it before deleting.`,
		});
	}

	const docker = await getRemoteDocker(target.serverId ?? null);
	try {
		// Match by name; Docker's network ID is not persisted (resilient to manual `docker network rm`).
		const dockerNetworks = await docker.listNetworks();
		const match = dockerNetworks.find((n) => n.Name === target.name);
		if (match) {
			await docker.getNetwork(match.Id).remove();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/has active endpoints|is in use/i.test(message)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Network "${target.name}" is in use by running containers. Disconnect or stop them first.`,
				cause: error,
			});
		}
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to remove Docker network: ${message}`,
			cause: error,
		});
	}

	const [deleted] = await db
		.delete(network)
		.where(
			and(
				eq(network.networkId, networkId),
				eq(network.organizationId, organizationId),
			),
		)
		.returning();

	return deleted;
};
