import { db } from "@dokploy/server/db";
import {
	type apiCreateServer,
	organization,
	server,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Server = typeof server.$inferSelect;

export const createServer = async (
	input: typeof apiCreateServer._type,
	organizationId: string,
) => {
	const newServer = await db
		.insert(server)
		.values({
			...input,
			organizationId: organizationId,
			createdAt: new Date().toISOString(),
		})
		.returning()
		.then((value) => value[0]);

	if (!newServer) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the server",
		});
	}

	return newServer;
};

export const findServerById = async (serverId: string) => {
	const currentServer = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
		with: {
			deployments: true,
			sshKey: true,
		},
	});
	if (!currentServer) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}
	return currentServer;
};

export const findServersByUserId = async (userId: string) => {
	const orgs = await db.query.organization.findMany({
		where: eq(organization.ownerId, userId),
		with: {
			servers: true,
		},
	});

	const servers = orgs.flatMap((org) => org.servers);

	return servers;
};

export const deleteServer = async (serverId: string) => {
	const currentServer = await db
		.delete(server)
		.where(eq(server.serverId, serverId))
		.returning()
		.then((value) => value[0]);

	return currentServer;
};

export const haveActiveServices = async (serverId: string) => {
	const currentServer = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
		with: {
			applications: true,
			compose: true,
			redis: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			postgres: true,
		},
	});

	if (!currentServer) {
		return false;
	}

	const total =
		currentServer?.applications?.length +
		currentServer?.compose?.length +
		currentServer?.redis?.length +
		currentServer?.mariadb?.length +
		currentServer?.mongo?.length +
		currentServer?.mysql?.length +
		currentServer?.postgres?.length;

	if (total === 0) {
		return false;
	}

	return true;
};

export const updateServerById = async (
	serverId: string,
	serverData: Partial<Server>,
) => {
	const result = await db
		.update(server)
		.set({
			...serverData,
		})
		.where(eq(server.serverId, serverId))
		.returning()
		.then((res) => res[0]);

	return result;
};

export const getAllServers = async () => {
	const servers = await db.query.server.findMany();
	return servers;
};
