import { db } from "@dokploy/server/db";
import {
	type apiCreateServer,
	applications,
	compose,
	libsql,
	mariadb,
	member,
	mongo,
	mysql,
	organization,
	postgres,
	redis,
	server,
} from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";

export type Server = typeof server.$inferSelect;

export type DeploymentType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mongo"
	| "mariadb"
	| "redis"
	| "libsql";

export type DeploymentStatus = "idle" | "running" | "done" | "error";

export interface DeploymentSummary {
	id: string;
	name: string;
	appName: string;
	type: DeploymentType;
	status: DeploymentStatus;
}

export interface DeploymentMetrics {
	appName: string;
	ok: boolean;
	cpuPct: number | null;
	memUsedMB: number | null;
	memTotalMB: number | null;
	memPct: number | null;
	netInBps: number | null;
	netOutBps: number | null;
	blockReadBps: number | null;
	blockWriteBps: number | null;
	timestamp: string | null;
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

export const listDeploymentsByServer = async (
	serverId: string | null,
): Promise<DeploymentSummary[]> => {
	const [apps, composes, pg, my, mg, ma, rd, ls] = await Promise.all([
		db
			.select({
				id: applications.applicationId,
				name: applications.name,
				appName: applications.appName,
				status: applications.applicationStatus,
			})
			.from(applications)
			.where(
				serverId === null
					? isNull(applications.serverId)
					: eq(applications.serverId, serverId),
			),
		db
			.select({
				id: compose.composeId,
				name: compose.name,
				appName: compose.appName,
				status: compose.composeStatus,
			})
			.from(compose)
			.where(
				serverId === null
					? isNull(compose.serverId)
					: eq(compose.serverId, serverId),
			),
		db
			.select({
				id: postgres.postgresId,
				name: postgres.name,
				appName: postgres.appName,
				status: postgres.applicationStatus,
			})
			.from(postgres)
			.where(
				serverId === null
					? isNull(postgres.serverId)
					: eq(postgres.serverId, serverId),
			),
		db
			.select({
				id: mysql.mysqlId,
				name: mysql.name,
				appName: mysql.appName,
				status: mysql.applicationStatus,
			})
			.from(mysql)
			.where(
				serverId === null
					? isNull(mysql.serverId)
					: eq(mysql.serverId, serverId),
			),
		db
			.select({
				id: mongo.mongoId,
				name: mongo.name,
				appName: mongo.appName,
				status: mongo.applicationStatus,
			})
			.from(mongo)
			.where(
				serverId === null
					? isNull(mongo.serverId)
					: eq(mongo.serverId, serverId),
			),
		db
			.select({
				id: mariadb.mariadbId,
				name: mariadb.name,
				appName: mariadb.appName,
				status: mariadb.applicationStatus,
			})
			.from(mariadb)
			.where(
				serverId === null
					? isNull(mariadb.serverId)
					: eq(mariadb.serverId, serverId),
			),
		db
			.select({
				id: redis.redisId,
				name: redis.name,
				appName: redis.appName,
				status: redis.applicationStatus,
			})
			.from(redis)
			.where(
				serverId === null
					? isNull(redis.serverId)
					: eq(redis.serverId, serverId),
			),
		db
			.select({
				id: libsql.libsqlId,
				name: libsql.name,
				appName: libsql.appName,
				status: libsql.applicationStatus,
			})
			.from(libsql)
			.where(
				serverId === null
					? isNull(libsql.serverId)
					: eq(libsql.serverId, serverId),
			),
	]);

	return [
		...apps.map((r) => ({ ...r, type: "application" as const })),
		...composes.map((r) => ({ ...r, type: "compose" as const })),
		...pg.map((r) => ({ ...r, type: "postgres" as const })),
		...my.map((r) => ({ ...r, type: "mysql" as const })),
		...mg.map((r) => ({ ...r, type: "mongo" as const })),
		...ma.map((r) => ({ ...r, type: "mariadb" as const })),
		...rd.map((r) => ({ ...r, type: "redis" as const })),
		...ls.map((r) => ({ ...r, type: "libsql" as const })),
	].sort((a, b) => a.name.localeCompare(b.name));
};

interface ContainerMetricResponse {
	timestamp: string;
	CPU: number;
	Memory: {
		percentage: number;
		used: number;
		total: number;
		usedUnit: string;
		totalUnit: string;
	};
	Network: {
		input: number;
		output: number;
		inputUnit: string;
		outputUnit: string;
	};
	BlockIO: {
		read: number;
		write: number;
		readUnit: string;
		writeUnit: string;
	};
}

const unitToMB = (value: number, unit: string): number => {
	switch (unit) {
		case "B":
			return value / 1024 / 1024;
		case "KiB":
		case "KB":
			return value / 1024;
		case "MiB":
		case "MB":
			return value;
		case "GiB":
		case "GB":
			return value * 1024;
		case "TiB":
		case "TB":
			return value * 1024 * 1024;
		default:
			return value;
	}
};

const unitToBytes = (value: number, unit: string): number => {
	switch (unit) {
		case "B":
			return value;
		case "KiB":
		case "KB":
			return value * 1024;
		case "MiB":
		case "MB":
			return value * 1024 * 1024;
		case "GiB":
		case "GB":
			return value * 1024 * 1024 * 1024;
		case "TiB":
		case "TB":
			return value * 1024 * 1024 * 1024 * 1024;
		default:
			return value;
	}
};

const emptyMetric = (appName: string, ok = false): DeploymentMetrics => ({
	appName,
	ok,
	cpuPct: null,
	memUsedMB: null,
	memTotalMB: null,
	memPct: null,
	netInBps: null,
	netOutBps: null,
	blockReadBps: null,
	blockWriteBps: null,
	timestamp: null,
});

export const fetchDeploymentMetrics = async (
	baseUrl: string,
	token: string,
	appNames: string[],
): Promise<DeploymentMetrics[]> => {
	if (appNames.length === 0) return [];

	const results = await Promise.allSettled(
		appNames.map(async (appName) => {
			const url = new URL(
				baseUrl.endsWith("/")
					? `${baseUrl}containers`
					: `${baseUrl}/containers`,
			);
			url.searchParams.append("appName", appName);
			url.searchParams.append("limit", "1");

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5_000);
			let response: Response;
			try {
				response = await fetch(url.toString(), {
					headers: { Authorization: `Bearer ${token}` },
					signal: controller.signal,
				});
			} finally {
				clearTimeout(timeout);
			}

			if (!response.ok) {
				throw new Error(`${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as ContainerMetricResponse[];
			const latest = Array.isArray(data) ? data[data.length - 1] : null;

			if (!latest) return emptyMetric(appName, true);

			return {
				appName,
				ok: true,
				cpuPct: latest.CPU,
				memUsedMB: unitToMB(latest.Memory.used, latest.Memory.usedUnit),
				memTotalMB: unitToMB(latest.Memory.total, latest.Memory.totalUnit),
				memPct: latest.Memory.percentage,
				netInBps: unitToBytes(latest.Network.input, latest.Network.inputUnit),
				netOutBps: unitToBytes(
					latest.Network.output,
					latest.Network.outputUnit,
				),
				blockReadBps: unitToBytes(latest.BlockIO.read, latest.BlockIO.readUnit),
				blockWriteBps: unitToBytes(
					latest.BlockIO.write,
					latest.BlockIO.writeUnit,
				),
				timestamp: latest.timestamp,
			} satisfies DeploymentMetrics;
		}),
	);

	return results.map((result, i) =>
		result.status === "fulfilled"
			? result.value
			: emptyMetric(appNames[i] ?? "", false),
	);
};
