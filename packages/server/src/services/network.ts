import { db } from "@dokploy/server/db";
import {
	type apiCreateNetwork,
	type apiUpdateNetwork,
	network,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
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
	input: typeof apiCreateNetwork._type,
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
		});

		return row;
	});

	return created;
};

export const updateNetwork = async (input: typeof apiUpdateNetwork._type) => {
	const { networkId, ...rest } = input;
	const [updated] = await db
		.update(network)
		.set(rest)
		.where(eq(network.networkId, networkId))
		.returning();

	if (!updated) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Network not found",
		});
	}

	return updated;
};

export const removeNetwork = async (networkId: string) => {
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
