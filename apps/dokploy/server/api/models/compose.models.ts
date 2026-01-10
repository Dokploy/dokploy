/**
 * Compose model
 */
export interface Compose {
	composeId: string;
	name: string;
	appName: string;
	description: string | null;
	env: string | null;
	composeFile: string;
	refreshToken: string | null;
	sourceType: "git" | "github" | "gitlab" | "bitbucket" | "gitea" | "raw";
	composeType: "docker-compose" | "stack";
	repository: string | null;
	owner: string | null;
	branch: string | null;
	autoDeploy: boolean | null;
	gitlabProjectId: number | null;
	gitlabRepository: string | null;
	gitlabOwner: string | null;
	gitlabBranch: string | null;
	gitlabPathNamespace: string | null;
	bitbucketRepository: string | null;
	bitbucketOwner: string | null;
	bitbucketBranch: string | null;
	giteaRepository: string | null;
	giteaOwner: string | null;
	giteaBranch: string | null;
	customGitUrl: string | null;
	customGitBranch: string | null;
	customGitSSHKeyId: string | null;
	command: string;
	enableSubmodules: boolean;
	composePath: string;
	suffix: string;
	randomize: boolean;
	isolatedDeployment: boolean;
	isolatedDeploymentsVolume: boolean;
	triggerType: string | null;
	composeStatus: string;
	environmentId: string;
	createdAt: string;
	watchPaths: string[] | null;
	githubId: string | null;
	gitlabId: string | null;
	bitbucketId: string | null;
	giteaId: string | null;
	serverId: string | null;
	environment: {
		environmentId: string;
		name: string;
		projectId: string;
		project: {
			projectId: string;
			name: string;
			description: string | null;
			organizationId: string;
			createdAt: string;
		};
	};
	deployments: Array<{
		deploymentId: string;
		status: string | null;
		composeId: string | null;
		createdAt: string;
	}>;
	mounts: Array<{
		mountId: string;
		type: "bind" | "volume" | "file";
		hostPath: string | null;
		volumeName: string | null;
		filePath: string | null;
		content: string | null;
		serviceType:
			| "application"
			| "postgres"
			| "mysql"
			| "mariadb"
			| "mongo"
			| "redis"
			| "compose";
		mountPath: string;
		applicationId: string | null;
		postgresId: string | null;
		mariadbId: string | null;
		mongoId: string | null;
		mysqlId: string | null;
		redisId: string | null;
		composeId: string | null;
	}>;
	domains: Array<{
		domainId: string;
		host: string;
		path: string | null;
		port: number | null;
		https: boolean;
		certificateType: string;
		composeId: string | null;
		createdAt: string;
	}>;
	github: any;
	gitlab: any;
	bitbucket: any;
	gitea: any;
	server: any;
	backups: Array<{
		backupId: string;
		composeId: string | null;
		destination: any;
		deployments: any[];
	}>;
	hasGitProviderAccess: boolean;
	unauthorizedProvider: string | null;
	definedVolumesInComposeFile?: Record<
		string,
		{
			config: any;
			usage: Array<{ service: string; mountPath: string }>;
			hostPath?: string;
			isBindMount?: boolean;
		}
	>;
}
