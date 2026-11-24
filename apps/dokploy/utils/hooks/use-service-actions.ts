import type { ServiceType } from "@dokploy/server/db/schema";
import { api } from "@/utils/api";

type ServiceAction = "start" | "stop" | "deploy" | "move" | "delete";

interface ServiceActionOptions {
	/** Compose only: also remove its volumes when deleting. */
	deleteVolumes?: boolean;
	/** Required for "move". */
	targetEnvironmentId?: string;
}

/**
 * Runs an action on any service type through that type's own router, so its
 * permission checks and side effects (containers, volumes, status) apply.
 */
export const useServiceActions = () => {
	const application = {
		start: api.application.start.useMutation(),
		stop: api.application.stop.useMutation(),
		deploy: api.application.deploy.useMutation(),
		move: api.application.move.useMutation(),
		delete: api.application.delete.useMutation(),
	};
	const compose = {
		start: api.compose.start.useMutation(),
		stop: api.compose.stop.useMutation(),
		deploy: api.compose.deploy.useMutation(),
		move: api.compose.move.useMutation(),
		delete: api.compose.delete.useMutation(),
	};
	const postgres = {
		start: api.postgres.start.useMutation(),
		stop: api.postgres.stop.useMutation(),
		deploy: api.postgres.deploy.useMutation(),
		move: api.postgres.move.useMutation(),
		delete: api.postgres.remove.useMutation(),
	};
	const mysql = {
		start: api.mysql.start.useMutation(),
		stop: api.mysql.stop.useMutation(),
		deploy: api.mysql.deploy.useMutation(),
		move: api.mysql.move.useMutation(),
		delete: api.mysql.remove.useMutation(),
	};
	const mariadb = {
		start: api.mariadb.start.useMutation(),
		stop: api.mariadb.stop.useMutation(),
		deploy: api.mariadb.deploy.useMutation(),
		move: api.mariadb.move.useMutation(),
		delete: api.mariadb.remove.useMutation(),
	};
	const mongo = {
		start: api.mongo.start.useMutation(),
		stop: api.mongo.stop.useMutation(),
		deploy: api.mongo.deploy.useMutation(),
		move: api.mongo.move.useMutation(),
		delete: api.mongo.remove.useMutation(),
	};
	const redis = {
		start: api.redis.start.useMutation(),
		stop: api.redis.stop.useMutation(),
		deploy: api.redis.deploy.useMutation(),
		move: api.redis.move.useMutation(),
		delete: api.redis.remove.useMutation(),
	};
	const libsql = {
		start: api.libsql.start.useMutation(),
		stop: api.libsql.stop.useMutation(),
		deploy: api.libsql.deploy.useMutation(),
		move: api.libsql.move.useMutation(),
		delete: api.libsql.remove.useMutation(),
	};

	const runServiceAction = (
		action: ServiceAction,
		service: { id: string; type: ServiceType },
		options: ServiceActionOptions = {},
	) => {
		const { id } = service;
		const targetEnvironmentId = options.targetEnvironmentId ?? "";
		switch (service.type) {
			case "application":
				return action === "move"
					? application.move.mutateAsync({
							applicationId: id,
							targetEnvironmentId,
						})
					: application[action].mutateAsync({ applicationId: id });
			case "compose":
				if (action === "move") {
					return compose.move.mutateAsync({
						composeId: id,
						targetEnvironmentId,
					});
				}
				return action === "delete"
					? compose.delete.mutateAsync({
							composeId: id,
							deleteVolumes: options.deleteVolumes ?? false,
						})
					: compose[action].mutateAsync({ composeId: id });
			case "postgres":
				return action === "move"
					? postgres.move.mutateAsync({ postgresId: id, targetEnvironmentId })
					: postgres[action].mutateAsync({ postgresId: id });
			case "mysql":
				return action === "move"
					? mysql.move.mutateAsync({ mysqlId: id, targetEnvironmentId })
					: mysql[action].mutateAsync({ mysqlId: id });
			case "mariadb":
				return action === "move"
					? mariadb.move.mutateAsync({ mariadbId: id, targetEnvironmentId })
					: mariadb[action].mutateAsync({ mariadbId: id });
			case "mongo":
				return action === "move"
					? mongo.move.mutateAsync({ mongoId: id, targetEnvironmentId })
					: mongo[action].mutateAsync({ mongoId: id });
			case "redis":
				return action === "move"
					? redis.move.mutateAsync({ redisId: id, targetEnvironmentId })
					: redis[action].mutateAsync({ redisId: id });
			case "libsql":
				return action === "move"
					? libsql.move.mutateAsync({ libsqlId: id, targetEnvironmentId })
					: libsql[action].mutateAsync({ libsqlId: id });
		}
	};

	return { runServiceAction };
};
