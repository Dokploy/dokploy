import type { findEnvironmentById } from "@dokploy/server";

export type Services = {
	serverId?: string | null;
	serverName?: string | null;
	serverIp?: string | null;
	metricsConfig?: any;
	name: string;
	appName?: string | null;
	replicas?: number;
	composeType?: "docker-compose" | "stack";
	type:
		| "mariadb"
		| "application"
		| "postgres"
		| "mysql"
		| "mongo"
		| "redis"
		| "compose"
		| "libsql";
	description?: string | null;
	id: string;
	createdAt: string;
	status?: "idle" | "running" | "done" | "error";
	lastDeployDate?: Date | null;
	icon?: string | null;
};

type Environment = Awaited<ReturnType<typeof findEnvironmentById>>;

export const extractServicesFromEnvironment = (
	environment: Environment | undefined,
) => {
	if (!environment) return [];

	const allServices: Services[] = [];

	const applications: Services[] =
		environment.applications?.map((item) => {
			let lastDeployDate: Date | null = null;
			const deployments = (item as any).deployments;
			if (deployments && deployments.length > 0) {
				for (const deployment of deployments) {
					const deployDate = new Date(
						deployment.finishedAt ||
							deployment.startedAt ||
							deployment.createdAt,
					);
					if (!lastDeployDate || deployDate > lastDeployDate) {
						lastDeployDate = deployDate;
					}
				}
			}
			return {
				name: item.name,
				type: "application" as const,
				id: item.applicationId,
				appName: item.appName,
				replicas: item.replicas ?? 1,
				createdAt: item.createdAt,
				status: item.applicationStatus,
				description: item.description,
				serverId: item.serverId,
				serverName: item?.server?.name || null,
				serverIp: item?.server?.ipAddress || null,
				metricsConfig: item?.server?.metricsConfig,
				lastDeployDate,
				icon: item.icon || null,
			};
		}) || [];

	const mariadb: Services[] =
		environment.mariadb?.map((item) => ({
			name: item.name,
			type: "mariadb" as const,
			id: item.mariadbId,
			appName: item.appName,
			replicas: item.replicas ?? 1,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
			serverIp: item?.server?.ipAddress || null,
			metricsConfig: item?.server?.metricsConfig,
		})) || [];

	const postgres: Services[] =
		environment.postgres?.map((item) => ({
			name: item.name,
			type: "postgres" as const,
			id: item.postgresId,
			appName: item.appName,
			replicas: item.replicas ?? 1,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
			serverIp: item?.server?.ipAddress || null,
			metricsConfig: item?.server?.metricsConfig,
		})) || [];

	const mongo: Services[] =
		environment.mongo?.map((item) => ({
			name: item.name,
			type: "mongo" as const,
			id: item.mongoId,
			appName: item.appName,
			replicas: item.replicas ?? 1,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
			serverIp: item?.server?.ipAddress || null,
			metricsConfig: item?.server?.metricsConfig,
		})) || [];

	const redis: Services[] =
		environment.redis?.map((item) => ({
			name: item.name,
			type: "redis" as const,
			id: item.redisId,
			appName: item.appName,
			replicas: item.replicas ?? 1,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
			serverIp: item?.server?.ipAddress || null,
			metricsConfig: item?.server?.metricsConfig,
		})) || [];

	const mysql: Services[] =
		environment.mysql?.map((item) => ({
			name: item.name,
			type: "mysql" as const,
			id: item.mysqlId,
			appName: item.appName,
			replicas: item.replicas ?? 1,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
			serverIp: item?.server?.ipAddress || null,
			metricsConfig: item?.server?.metricsConfig,
		})) || [];

	const compose: Services[] =
		environment.compose?.map((item) => {
			let lastDeployDate: Date | null = null;
			const deployments = (item as any).deployments;
			if (deployments && deployments.length > 0) {
				for (const deployment of deployments) {
					const deployDate = new Date(
						deployment.finishedAt ||
							deployment.startedAt ||
							deployment.createdAt,
					);
					if (!lastDeployDate || deployDate > lastDeployDate) {
						lastDeployDate = deployDate;
					}
				}
			}
			return {
				name: item.name,
				type: "compose" as const,
				id: item.composeId,
				appName: item.appName,
				composeType: item.composeType,
				createdAt: item.createdAt,
				status: item.composeStatus,
				description: item.description,
				serverId: item.serverId,
				serverName: item?.server?.name || null,
				serverIp: item?.server?.ipAddress || null,
				metricsConfig: item?.server?.metricsConfig,
				lastDeployDate,
				icon: item.icon || null,
			};
		}) || [];

	const libsql: Services[] =
		environment.libsql?.map((item) => ({
			name: item.name,
			type: "libsql" as const,
			id: item.libsqlId,
			appName: item.appName,
			replicas: item.replicas ?? 1,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
			serverId: item.serverId,
			serverName: item?.server?.name || null,
			serverIp: item?.server?.ipAddress || null,
			metricsConfig: item?.server?.metricsConfig,
		})) || [];

	allServices.push(
		...applications,
		...compose,
		...libsql,
		...mysql,
		...redis,
		...mongo,
		...postgres,
		...mariadb,
	);

	allServices.sort((a, b) => {
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	return allServices;
};
