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

const findService = async (serviceId: string) => {
	for (const { table, id } of SERVICE_TABLES) {
		const [row] = await db
			.select({ appName: table.appName, serverId: table.serverId })
			.from(table)
			.where(eq(id, serviceId))
			.limit(1);
		if (row) return row;
	}
};

export const findServiceAppName = async (serviceId: string) =>
	(await findService(serviceId))?.appName;

const inspect = async (args: string[], serverId: string | null) => {
	const command = quote(["docker", "inspect", ...args]);
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);
	return stdout.trim();
};

// Swarm log targets are task IDs (`docker service logs <task>`), so resolve
// the task's service instead of reading container labels.
const taskBelongsToApp = async (
	taskId: string,
	appName: string,
	serverId: string | null,
) => {
	const swarmServiceId = await inspect(
		["--type", "task", "--format", "{{.ServiceID}}", taskId],
		serverId,
	);
	const spec = JSON.parse(
		await inspect(
			["--type", "service", "--format", "{{json .Spec}}", swarmServiceId],
			serverId,
		),
	);
	return (
		spec?.Name === appName ||
		spec?.Labels?.["com.docker.stack.namespace"] === appName
	);
};

// Service access alone must not allow reaching other tenants' containers.
export const containerBelongsToService = async (
	serviceId: string,
	containerId: string,
	serverId?: string | null,
	runType?: string | null,
): Promise<boolean> => {
	try {
		const service = await findService(serviceId);
		if (!service) return false;
		const targetServerId = serverId || null;
		if ((service.serverId || null) !== targetServerId) return false;
		if (runType === "swarm") {
			return await taskBelongsToApp(
				containerId,
				service.appName,
				targetServerId,
			);
		}
		const labels =
			JSON.parse(
				await inspect(
					["--format", "{{json .Config.Labels}}", containerId],
					targetServerId,
				),
			) ?? {};
		return OWNERSHIP_LABELS.some((label) => labels[label] === service.appName);
	} catch {
		return false;
	}
};
