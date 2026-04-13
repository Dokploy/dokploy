import { db } from "@dokploy/server/db";
import {
	type apiCreateServer,
	member,
	organization,
	server,
} from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

export type Server = typeof server.$inferSelect;

export const createServer = async (
	input: z.infer<typeof apiCreateServer>,
	organizationId: string,
) => {
	const newServer = await db
		.insert(server)
		.values({
			...input,
			organizationId: organizationId,
			createdAt: new Date().toISOString(),
		} as typeof server.$inferInsert)
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
			libsql: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			postgres: true,
			redis: true,
		},
	});

	if (!currentServer) {
		return false;
	}

	const total =
		currentServer?.applications?.length +
		currentServer?.compose?.length +
		currentServer?.libsql?.length +
		currentServer?.mariadb?.length +
		currentServer?.mongo?.length +
		currentServer?.mysql?.length +
		currentServer?.postgres?.length +
		currentServer?.redis?.length;

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

export const getAccessibleServerIds = async (session: {
	userId: string;
	activeOrganizationId: string;
}): Promise<Set<string>> => {
	const { userId, activeOrganizationId } = session;

	const allOrgServers = await db.query.server.findMany({
		where: eq(server.organizationId, activeOrganizationId),
		columns: {
			serverId: true,
		},
	});

	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, activeOrganizationId),
		),
		columns: { accessedServers: true, role: true },
	});

	if (memberRecord?.role === "owner" || memberRecord?.role === "admin") {
		return new Set(allOrgServers.map((s) => s.serverId));
	}

	const licensed = await hasValidLicense(activeOrganizationId);

	if (!licensed) {
		return new Set(allOrgServers.map((s) => s.serverId));
	}

	return new Set(memberRecord?.accessedServers ?? []);
};
