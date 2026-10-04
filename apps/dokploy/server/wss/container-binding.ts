import { getRemoteDocker } from "@dokploy/server";
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
import { eq } from "drizzle-orm";

export type WssContainerTarget =
	| { type: "terminal"; containerId: string }
	| { type: "logs"; containerId: string; runType: string | null }
	| {
			type: "stats";
			appName: string;
			appType: "application" | "stack" | "docker-compose";
	  };

type ServiceKind = "swarm" | "docker-compose" | "stack";

type BoundService = {
	appName: string;
	serverId: string | null;
	kind: ServiceKind;
};

const SERVICE_LABEL: Record<ServiceKind, string> = {
	swarm: "com.docker.swarm.service.name",
	"docker-compose": "com.docker.compose.project",
	stack: "com.docker.stack.namespace",
};

const columns = { appName: true, serverId: true } as const;

const findBoundService = async (
	serviceId: string,
): Promise<BoundService | null> => {
	const [composeRow, ...swarmRows] = await Promise.all([
		db.query.compose.findFirst({
			where: eq(compose.composeId, serviceId),
			columns: { ...columns, composeType: true },
		}),
		db.query.applications.findFirst({
			where: eq(applications.applicationId, serviceId),
			columns,
		}),
		db.query.postgres.findFirst({
			where: eq(postgres.postgresId, serviceId),
			columns,
		}),
		db.query.mysql.findFirst({
			where: eq(mysql.mysqlId, serviceId),
			columns,
		}),
		db.query.mariadb.findFirst({
			where: eq(mariadb.mariadbId, serviceId),
			columns,
		}),
		db.query.mongo.findFirst({
			where: eq(mongo.mongoId, serviceId),
			columns,
		}),
		db.query.redis.findFirst({
			where: eq(redis.redisId, serviceId),
			columns,
		}),
		db.query.libsql.findFirst({
			where: eq(libsql.libsqlId, serviceId),
			columns,
		}),
	]);
	if (composeRow) {
		return {
			appName: composeRow.appName,
			serverId: composeRow.serverId,
			kind: composeRow.composeType,
		};
	}
	const swarmRow = swarmRows.find((row) => !!row);
	if (swarmRow) {
		return {
			appName: swarmRow.appName,
			serverId: swarmRow.serverId,
			kind: "swarm",
		};
	}
	return null;
};

const readContainerLabels = async (
	service: BoundService,
	target: Extract<WssContainerTarget, { containerId: string }>,
): Promise<Record<string, string>> => {
	const docker = await getRemoteDocker(service.serverId);
	// In swarm mode the logs handler runs `docker service logs` on a task id,
	// and a task carries its service only by id. That command tries the string
	// as a service first, so only a full task ID names the inspected task.
	if (target.type === "logs" && target.runType === "swarm") {
		const task = await docker.getTask(target.containerId).inspect();
		if (task.ID !== target.containerId) {
			return {};
		}
		const owner = await docker.getService(task.ServiceID).inspect();
		return {
			...owner.Spec?.Labels,
			[SERVICE_LABEL.swarm]: owner.Spec?.Name,
		};
	}
	const container = await docker.getContainer(target.containerId).inspect();
	return container.Config?.Labels ?? {};
};

const statsNameBelongsTo = (
	service: BoundService,
	target: Extract<WssContainerTarget, { type: "stats" }>,
) => {
	switch (target.appType) {
		case "application":
			return service.kind === "swarm" && target.appName === service.appName;
		case "docker-compose":
			return (
				service.kind === "docker-compose" && target.appName === service.appName
			);
		case "stack":
			return (
				service.kind === "stack" &&
				target.appName.startsWith(`${service.appName}_`)
			);
	}
};

// Rejects when the container cannot be inspected, so a missing container is
// refused by the caller's catch.
export const isContainerBoundToService = async (
	serviceId: string,
	serverId: string | null | undefined,
	target: WssContainerTarget,
): Promise<boolean> => {
	const service = await findBoundService(serviceId);
	if (!service || (serverId || null) !== service.serverId) {
		return false;
	}
	if (target.type === "stats") {
		return statsNameBelongsTo(service, target);
	}
	const labels = await readContainerLabels(service, target);
	return labels[SERVICE_LABEL[service.kind]] === service.appName;
};
