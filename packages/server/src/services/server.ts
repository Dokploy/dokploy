import { Client } from "ssh2";
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
export interface ServerStorageUsage {
	usedPercentage: number;
	used: string;
	total: string;
	available: string;
	mountPoint: string;
}

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

/**
 * Removes the SSH private key material from a server record before it is sent
 * to a client. `findServerById` eagerly loads the `sshKey` relation (needed for
 * server-side SSH operations), but the private key must never leave the server:
 * no client feature consumes it, and returning it exposed it to any member with
 * only `server:read`. Server-side callers keep using `findServerById` directly.
 */
export const redactServerSshKey = <
	T extends { sshKey?: { privateKey: string } | null },
>(
	serverRecord: T,
): T => {
	if (!serverRecord.sshKey) {
		return serverRecord;
	}
	return {
		...serverRecord,
		sshKey: { ...serverRecord.sshKey, privateKey: "" },
	};
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
		columns: { serverId: true },
		with: {
			applications: { columns: { applicationId: true } },
			compose: { columns: { composeId: true } },
			libsql: { columns: { libsqlId: true } },
			mariadb: { columns: { mariadbId: true } },
			mongo: { columns: { mongoId: true } },
			mysql: { columns: { mysqlId: true } },
			postgres: { columns: { postgresId: true } },
			redis: { columns: { redisId: true } },
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

export const getServerStorageUsage = async (
	serverId: string,
): Promise<ServerStorageUsage> => {
	const currentServer = await findServerById(serverId);

	if (!currentServer.sshKeyId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No SSH Key found for this server",
		});
	}

	if (currentServer.serverStatus !== "active") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is not active",
		});
	}

	return new Promise<ServerStorageUsage>((resolve, reject) => {
		const client = new Client();

		client
			.once("ready", () => {
				const bashCommand = `
					df -h / | awk 'NR==2 {
						used_percent = $5;
						gsub(/%/, "", used_percent);
						used = $3;
						total = $2;
						available = $4;
						mount = $6;
						print used_percent "|" used "|" total "|" available "|" mount;
					}'
				`;

				client.exec(bashCommand, (err, stream) => {
					if (err) {
						client.end();
						reject(err);
						return;
					}

					let output = "";
					stream
						.on("close", () => {
							client.end();
							try {
								const parts = output.trim().split("|");
								if (parts.length === 5) {
									resolve({
										usedPercentage: Number.parseInt(parts[0] ?? "0", 10),
										used: parts[1] ?? "",
										total: parts[2] ?? "",
										available: parts[3] ?? "",
										mountPoint: parts[4] ?? "",
									});
								} else {
									reject(new Error("Failed to parse disk usage output"));
								}
							} catch (parseError) {
								reject(
									new Error(
										`Failed to parse storage usage: ${parseError instanceof Error ? parseError.message : parseError}`,
									),
								);
							}
						})
						.on("data", (data: Buffer) => {
							output += data.toString();
						})
						.stderr.on("data", (data: Buffer) => {
							console.error(
								`Storage usage error for server ${serverId}:`,
								data.toString(),
							);
						});
				});
			})
			.on("error", (err) => {
				client.end();
				if (err.level === "client-authentication") {
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. Error: ${err.message}`,
						),
					);
				} else {
					reject(new Error(`SSH connection error: ${err.message}`));
				}
			})
			.connect({
				host: currentServer.ipAddress,
				port: currentServer.port,
				username: currentServer.username,
				privateKey: currentServer.sshKey?.privateKey,
			});
	});
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
