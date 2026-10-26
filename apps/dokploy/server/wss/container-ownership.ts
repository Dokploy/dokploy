import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
} from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";

const OWNERSHIP_LABELS = [
	"com.docker.swarm.service.name",
	"com.docker.compose.project",
	"com.docker.stack.namespace",
];

const SERVICE_TABLES = [
	{ table: applications, id: applications.applicationId },
	{ table: compose, id: compose.composeId },
	{ table: postgres, id: postgres.postgresId },
	{ table: mysql, id: mysql.mysqlId },
	{ table: mariadb, id: mariadb.mariadbId },
	{ table: mongo, id: mongo.mongoId },
	{ table: redis, id: redis.redisId },
	{ table: libsql, id: libsql.libsqlId },
];

export const findServiceAppName = async (serviceId: string) => {
	for (const { table, id } of SERVICE_TABLES) {
		const [row] = await db
			.select({ appName: table.appName })
			.from(table)
			.where(eq(id, serviceId))
			.limit(1);
		if (row) return row.appName;
	}
};

// Service access alone must not allow `docker exec` into other tenants' containers.
export const containerBelongsToService = async (
	serviceId: string,
	containerId: string,
	serverId?: string | null,
): Promise<boolean> => {
	try {
		const appName = await findServiceAppName(serviceId);
		if (!appName) return false;
		const command = quote([
			"docker",
			"inspect",
			"--format",
			"{{json .Config.Labels}}",
			containerId,
		]);
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		const labels = JSON.parse(stdout.trim()) ?? {};
		return OWNERSHIP_LABELS.some((label) => labels[label] === appName);
	} catch {
		return false;
	}
};
