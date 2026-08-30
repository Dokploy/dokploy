export type RailwayServiceType =
	| "mariadb"
	| "application"
	| "postgres"
	| "mysql"
	| "mongo"
	| "redis"
	| "compose"
	| "libsql";

export type RailwayService = {
	serverId?: string | null;
	serverName?: string | null;
	serverIp?: string | null;
	serverUsername?: string | null;
	name: string;
	type: RailwayServiceType;
	description?: string | null;
	id: string;
	createdAt: string;
	status?: "idle" | "running" | "done" | "error";
	lastDeployDate?: Date | null;
	icon?: string | null;
	appName?: string | null;
	refreshToken?: string | null;
	composeType?: "stack" | "docker-compose";
	href?: string;
	networkIds?: string[];
	detachDokployNetwork?: boolean;
	serviceNetworks?: Array<{
		serviceName: string;
		networkIds: string[];
		detachDokployNetwork: boolean;
	}>;
	pendingAction?: "delete";
	branch?: string | null;
	customGitBranch?: string | null;
	dockerImage?: string | null;
	domains?: Array<{
		host: string;
		path?: string | null;
		https?: boolean | null;
	}> | null;
	domain?: string | null;
	commitMessage?: string | null;
	commitHash?: string | null;
	databaseVersion?: string | null;
};
