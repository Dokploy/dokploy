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

const findServiceAppName = async (serviceId: string) => {
	const [app, comp, pg, my, maria, mon, red, lib] = await Promise.all([
		db.query.applications.findFirst({
			where: eq(applications.applicationId, serviceId),
			columns: { appName: true },
		}),
		db.query.compose.findFirst({
			where: eq(compose.composeId, serviceId),
			columns: { appName: true },
		}),
		db.query.postgres.findFirst({
			where: eq(postgres.postgresId, serviceId),
			columns: { appName: true },
		}),
		db.query.mysql.findFirst({
			where: eq(mysql.mysqlId, serviceId),
			columns: { appName: true },
		}),
		db.query.mariadb.findFirst({
			where: eq(mariadb.mariadbId, serviceId),
			columns: { appName: true },
		}),
		db.query.mongo.findFirst({
			where: eq(mongo.mongoId, serviceId),
			columns: { appName: true },
		}),
		db.query.redis.findFirst({
			where: eq(redis.redisId, serviceId),
			columns: { appName: true },
		}),
		db.query.libsql.findFirst({
			where: eq(libsql.libsqlId, serviceId),
			columns: { appName: true },
		}),
	]);
	return (app ?? comp ?? pg ?? my ?? maria ?? mon ?? red ?? lib)?.appName;
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
