import type { EnvironmentRow, ProjectTree } from "./queries";
import type { ExportScope, ServiceType, UsedBy } from "./types";

export const SERVICE_TYPES = [
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"compose",
	"libsql",
] as const satisfies readonly ServiceType[];

export const SERVICE_ID_FIELD: Record<ServiceType, string> = {
	application: "applicationId",
	postgres: "postgresId",
	mysql: "mysqlId",
	mariadb: "mariadbId",
	mongo: "mongoId",
	redis: "redisId",
	compose: "composeId",
	libsql: "libsqlId",
};

export const SERVICE_TYPE_ENV_KEY: Record<ServiceType, keyof EnvironmentRow> = {
	application: "applications",
	postgres: "postgres",
	mysql: "mysql",
	mariadb: "mariadb",
	mongo: "mongo",
	redis: "redis",
	compose: "compose",
	libsql: "libsql",
};

export const serviceDisplayName = (service: Record<string, unknown>): string =>
	(service.name as string | undefined) ??
	(service.appName as string | undefined) ??
	"";

export type TaggedService = {
	serviceType: ServiceType;
	environmentId: string;
	service: Record<string, unknown>;
};

export const allServices = (environments: EnvironmentRow[]): TaggedService[] =>
	environments.flatMap((env) =>
		SERVICE_TYPES.flatMap((serviceType) =>
			(env[SERVICE_TYPE_ENV_KEY[serviceType]] as Record<string, unknown>[]).map(
				(service) => ({
					serviceType,
					environmentId: env.environmentId,
					service,
				}),
			),
		),
	);

export const filterEnvironments = (
	tree: ProjectTree,
	scope: ExportScope,
): EnvironmentRow[] => {
	if (!scope.environmentIds) {
		return tree.environments;
	}
	const allowed = new Set(scope.environmentIds);
	return tree.environments.filter((env) => allowed.has(env.environmentId));
};

export const filterServices = <T extends Record<string, unknown>>(
	services: T[],
	serviceType: ServiceType,
	scope: ExportScope,
): T[] => {
	if (!scope.serviceIds) {
		return services;
	}
	const allowed = new Set(scope.serviceIds);
	const idField = SERVICE_ID_FIELD[serviceType];
	return services.filter((service) => allowed.has(service[idField] as string));
};

export const scopedServices = (
	tree: ProjectTree,
	scope: ExportScope,
): TaggedService[] =>
	allServices(filterEnvironments(tree, scope)).filter(
		({ serviceType, service }) =>
			filterServices([service], serviceType, scope).length > 0,
	);

export const buildUsedBy = (
	environmentId: string,
	serviceType: UsedBy["serviceType"],
	service: Record<string, unknown>,
	serviceId: string,
	field?: string,
): UsedBy => ({
	serviceId,
	serviceType,
	serviceName: serviceDisplayName(service),
	environmentId,
	field,
});
