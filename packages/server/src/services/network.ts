import { db } from "@dokploy/server/db";
import { type apiCreateNetwork, network } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";
import { getRemoteDocker } from "../utils/servers/remote-docker";

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

		const docker = await getRemoteDocker(input.serverId ?? null);
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

		return row;
	});

	return created;
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
