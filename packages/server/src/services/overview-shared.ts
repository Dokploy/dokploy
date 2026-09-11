// No db/schema imports here — client components import this file directly, and dockerode/ssh2 (child_process) would break the browser bundle.

export type OverviewServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "compose"
	| "libsql";

export interface OverviewService {
	id: string;
	type: OverviewServiceType;
	name: string;
	appName: string;
	status: string | null;
	createdAt: string;
	serverId: string | null;
	serverName: string | null;
	icon: string | null;
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
	lastDeployAt: string | null;
}

export type OverviewSortBy =
	| "name-asc"
	| "name-desc"
	| "type-asc"
	| "type-desc"
	| "createdAt-asc"
	| "createdAt-desc"
	| "lastDeploy-asc"
	| "lastDeploy-desc";

export const sortOverviewServices = (
	services: OverviewService[],
	sortBy: OverviewSortBy,
): OverviewService[] => {
	const [field, direction] = sortBy.split("-") as [string, "asc" | "desc"];
	return [...services].sort((a, b) => {
		if (field === "name") {
			const cmp = a.name.localeCompare(b.name);
			return direction === "asc" ? cmp : -cmp;
		}
		if (field === "type") {
			const cmp = a.type.localeCompare(b.type);
			return direction === "asc" ? cmp : -cmp;
		}
		if (field === "createdAt") {
			const cmp =
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			return direction === "asc" ? cmp : -cmp;
		}
		// lastDeploy: services without a deploy always sort to the end.
		const aDate = a.lastDeployAt ? new Date(a.lastDeployAt).getTime() : null;
		const bDate = b.lastDeployAt ? new Date(b.lastDeployAt).getTime() : null;
		if (aDate === null && bDate === null) return 0;
		if (aDate === null) return 1;
		if (bDate === null) return -1;
		return direction === "desc" ? bDate - aDate : aDate - bDate;
	});
};

export const DB_ENGINE_ICON_TYPES = new Set([
	"postgres",
	"mariadb",
	"mysql",
	"mongo",
	"redis",
	"libsql",
]);

export const getServiceOverviewIcon = (service: {
	type: OverviewServiceType;
	icon: string | null;
}):
	| { kind: "db"; engine: string }
	| { kind: "custom"; url: string }
	| { kind: "generic"; type: "application" | "compose" } => {
	if (DB_ENGINE_ICON_TYPES.has(service.type)) {
		return { kind: "db", engine: service.type };
	}
	if (service.icon) {
		return { kind: "custom", url: service.icon };
	}
	return { kind: "generic", type: service.type as "application" | "compose" };
};

export type OverviewBackupKind = "backup" | "volumeBackup";

export interface OverviewBackup {
	deploymentId: string;
	kind: OverviewBackupKind;
	status: string | null;
	createdAt: string;
	destinationId: string;
	destinationName: string;
	databaseType: string | null;
	serviceType: string | null;
	backupType: "database" | "compose" | null;
	serviceName: string;
	serviceOwnerId: string | null;
	serviceOwnerType: OverviewServiceType | "web-server";
	serverId: string | null;
	projectId: string | null;
	environmentId: string | null;
}

export type OverviewDomainOwnerType = "application" | "compose";

export interface OverviewDomain {
	domainId: string;
	host: string;
	path: string | null;
	port: number | null;
	customEntrypoint: string | null;
	https: boolean;
	certificateType: "letsencrypt" | "none" | "custom";
	createdAt: string;
	enabled: boolean;
	domainType: "application" | "compose" | "preview" | null;
	serviceOwnerId: string;
	serviceOwnerType: OverviewDomainOwnerType;
	serviceName: string;
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
}

export type OverviewDomainSortBy =
	| "createdAt-asc"
	| "createdAt-desc"
	| "port-asc"
	| "port-desc";

export const sortOverviewDomains = (
	domains: OverviewDomain[],
	sortBy: OverviewDomainSortBy,
): OverviewDomain[] => {
	const [field, direction] = sortBy.split("-") as [string, "asc" | "desc"];
	return [...domains].sort((a, b) => {
		if (field === "port") {
			// Domains without a port sort to the end regardless of direction.
			const aPort = a.port;
			const bPort = b.port;
			if (aPort === null && bPort === null) return 0;
			if (aPort === null) return 1;
			if (bPort === null) return -1;
			return direction === "asc" ? aPort - bPort : bPort - aPort;
		}
		const cmp =
			new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		return direction === "asc" ? cmp : -cmp;
	});
};

export const getBackupOverviewIcon = (
	row: Pick<
		OverviewBackup,
		"databaseType" | "serviceType" | "serviceOwnerType"
	>,
):
	| { kind: "db"; engine: string }
	| { kind: "generic"; type: "application" | "compose" }
	| { kind: "webServer" } => {
	const engine = row.databaseType ?? row.serviceType;
	if (engine === "web-server") {
		return { kind: "webServer" };
	}
	if (engine && DB_ENGINE_ICON_TYPES.has(engine)) {
		return { kind: "db", engine };
	}
	if (row.serviceOwnerType === "compose") {
		return { kind: "generic", type: "compose" };
	}
	return { kind: "generic", type: "application" };
};
