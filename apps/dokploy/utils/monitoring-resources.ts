interface ProjectEnvApplication {
	applicationId: string;
	appName?: string;
	name: string;
}

interface ProjectEnvironment {
	applications: ProjectEnvApplication[];
	compose: Array<{
		composeId: string;
		appName?: string;
		name: string;
		composeType?: string;
	}>;
	postgres: Array<{ postgresId: string; appName?: string; name: string }>;
	redis: Array<{ redisId: string; appName?: string; name: string }>;
	mysql: Array<{ mysqlId: string; appName?: string; name: string }>;
	mongo: Array<{ mongoId: string; appName?: string; name: string }>;
	mariadb: Array<{ mariadbId: string; appName?: string; name: string }>;
}

interface ProjectShape {
	projectId: string;
	name: string;
	environments: ProjectEnvironment[];
}

export type MonitoringResource = {
	key: string;
	projectId: string;
	projectName: string;
	appName?: string;
	label: string;
	type: string;
	appType: "application" | "stack" | "docker-compose";
};

export function buildMonitoringResources(
	projects?: ProjectShape[] | null,
): MonitoringResource[] {
	if (!projects) return [];

	return projects.flatMap((project) => {
		const projectId = project.projectId;
		const projectName = project.name;

		return project.environments.flatMap((environment) => [
			...environment.applications
				.filter((app) => Boolean(app.appName))
				.map((app) => ({
					key: `application-${app.applicationId}`,
					projectId,
					projectName,
					appName: app.appName || "",
					label: app.name,
					type: "Application",
					appType: "application" as const,
				})),
			...environment.compose
				.filter((service) => Boolean(service.appName))
				.map((service) => ({
					key: `compose-${service.composeId}`,
					projectId,
					projectName,
					appName: service.appName || "",
					label: service.name,
					type: "Compose",
					appType:
						(service.composeType as MonitoringResource["appType"]) ||
						("docker-compose" as const),
				})),
			...environment.postgres
				.filter((service) => Boolean(service.appName))
				.map((service) => ({
					key: `postgres-${service.postgresId}`,
					projectId,
					projectName,
					appName: service.appName || "",
					label: service.name,
					type: "Postgres",
					appType: "application" as const,
				})),
			...environment.redis
				.filter((service) => Boolean(service.appName))
				.map((service) => ({
					key: `redis-${service.redisId}`,
					projectId,
					projectName,
					appName: service.appName || "",
					label: service.name,
					type: "Redis",
					appType: "application" as const,
				})),
			...environment.mysql
				.filter((service) => Boolean(service.appName))
				.map((service) => ({
					key: `mysql-${service.mysqlId}`,
					projectId,
					projectName,
					appName: service.appName || "",
					label: service.name,
					type: "MySQL",
					appType: "application" as const,
				})),
			...environment.mongo
				.filter((service) => Boolean(service.appName))
				.map((service) => ({
					key: `mongo-${service.mongoId}`,
					projectId,
					projectName,
					appName: service.appName || "",
					label: service.name,
					type: "MongoDB",
					appType: "application" as const,
				})),
			...environment.mariadb
				.filter((service) => Boolean(service.appName))
				.map((service) => ({
					key: `mariadb-${service.mariadbId}`,
					projectId,
					projectName,
					appName: service.appName || "",
					label: service.name,
					type: "MariaDB",
					appType: "application" as const,
				})),
		]);
	});
}

export default buildMonitoringResources;
