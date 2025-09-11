import { applications } from "@dokploy/server/db/schema/application";
import { bitbucket } from "@dokploy/server/db/schema/bitbucket";
import { deployments } from "@dokploy/server/db/schema/deployment";
import { domains } from "@dokploy/server/db/schema/domain";
import { environments } from "@dokploy/server/db/schema/environment";
import { gitea } from "@dokploy/server/db/schema/gitea";
import { github } from "@dokploy/server/db/schema/github";
import { gitlab } from "@dokploy/server/db/schema/gitlab";
import { mounts } from "@dokploy/server/db/schema/mount";
import { ports } from "@dokploy/server/db/schema/port";
import { previewDeployments } from "@dokploy/server/db/schema/preview-deployments";
import { projects } from "@dokploy/server/db/schema/project";
import { redirects } from "@dokploy/server/db/schema/redirects";
import { registry } from "@dokploy/server/db/schema/registry";
import { security } from "@dokploy/server/db/schema/security";
import { server } from "@dokploy/server/db/schema/server";
import {
	HealthCheckSwarmSchema,
	LabelsSwarmSchema,
	NetworkSwarmSchema,
	PlacementSwarmSchema,
	RestartPolicySwarmSchema,
	ServiceModeSwarmSchema,
	UpdateConfigSwarmSchema,
} from "@dokploy/server/db/schema/shared";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const projectSelectSchema = createSelectSchema(projects);
const environmentSelectSchema = createSelectSchema(environments).extend({
	project: projectSelectSchema,
});
const domainSelectSchema = createSelectSchema(domains);
const deploymentSelectSchema = createSelectSchema(deployments);
const mountSelectSchema = createSelectSchema(mounts);
const redirectSelectSchema = createSelectSchema(redirects);
const securitySelectSchema = createSelectSchema(security);
const portSelectSchema = createSelectSchema(ports);
const registrySelectSchema = createSelectSchema(registry);
const githubSelectSchema = createSelectSchema(github);
const gitlabSelectSchema = createSelectSchema(gitlab);
const bitbucketSelectSchema = createSelectSchema(bitbucket);
const giteaSelectSchema = createSelectSchema(gitea);
const serverSelectSchema = createSelectSchema(server);
const previewDeploymentSelectSchema = createSelectSchema(previewDeployments);

const createSchema = createInsertSchema(applications, {
	appName: z.string(),
	createdAt: z.string(),
	applicationId: z.string(),
	autoDeploy: z.boolean(),
	env: z.string().optional(),
	buildArgs: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	title: z.string().optional(),
	enabled: z.boolean().optional(),
	subtitle: z.string().optional(),
	dockerImage: z.string().optional(),
	username: z.string().optional(),
	isPreviewDeploymentsActive: z.boolean().optional(),
	password: z.string().optional(),
	registryUrl: z.string().optional(),
	customGitSSHKeyId: z.string().optional(),
	repository: z.string().optional(),
	dockerfile: z.string().optional(),
	branch: z.string().optional(),
	customGitBranch: z.string().optional(),
	customGitBuildPath: z.string().optional(),
	customGitUrl: z.string().optional(),
	buildPath: z.string().optional(),
	environmentId: z.string(),
	sourceType: z
		.enum(["github", "docker", "git", "gitlab", "bitbucket", "gitea", "drop"])
		.optional(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	buildType: z.enum([
		"dockerfile",
		"heroku_buildpacks",
		"paketo_buildpacks",
		"nixpacks",
		"static",
		"railpack",
	]),
	railpackVersion: z.string().optional(),
	herokuVersion: z.string().optional(),
	publishDirectory: z.string().optional(),
	isStaticSpa: z.boolean().optional(),
	owner: z.string(),
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
	previewPort: z.number().optional(),
	previewEnv: z.string().optional(),
	previewBuildArgs: z.string().optional(),
	previewWildcard: z.string().optional(),
	previewLimit: z.number().optional(),
	previewHttps: z.boolean().optional(),
	previewPath: z.string().optional(),
	previewCertificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
	previewRequireCollaboratorPermissions: z.boolean().optional(),
	watchPaths: z.array(z.string()).optional(),
	previewLabels: z.array(z.string()).optional(),
	cleanCache: z.boolean().optional(),
});

export const apiCreateApplicationOutput = createSchema.pick({
	applicationId: true,
	name: true,
	appName: true,
	description: true,
	env: true,
	previewEnv: true,
	watchPaths: true,
	previewBuildArgs: true,
	previewLabels: true,
	previewWildcard: true,
	previewPort: true,
	previewHttps: true,
	previewPath: true,
	previewCertificateType: true,
	previewCustomCertResolver: true,
	previewLimit: true,
	isPreviewDeploymentsActive: true,
	previewRequireCollaboratorPermissions: true,
	rollbackActive: true,
	buildArgs: true,
	memoryReservation: true,
	memoryLimit: true,
	cpuReservation: true,
	cpuLimit: true,
	title: true,
	enabled: true,
	subtitle: true,
	command: true,
	refreshToken: true,
	sourceType: true,
	cleanCache: true,
	repository: true,
	owner: true,
	branch: true,
	buildPath: true,
	triggerType: true,
	autoDeploy: true,
	gitlabProjectId: true,
	gitlabRepository: true,
	gitlabOwner: true,
	gitlabBranch: true,
	gitlabBuildPath: true,
	gitlabPathNamespace: true,
	giteaRepository: true,
	giteaOwner: true,
	giteaBranch: true,
	giteaBuildPath: true,
	bitbucketRepository: true,
	bitbucketOwner: true,
	bitbucketBranch: true,
	bitbucketBuildPath: true,
	username: true,
	password: true,
	dockerImage: true,
	registryUrl: true,
	customGitUrl: true,
	customGitBranch: true,
	customGitBuildPath: true,
	customGitSSHKeyId: true,
	enableSubmodules: true,
	dockerfile: true,
	dockerContextPath: true,
	dockerBuildStage: true,
	dropBuildPath: true,
	healthCheckSwarm: true,
	restartPolicySwarm: true,
	placementSwarm: true,
	updateConfigSwarm: true,
	rollbackConfigSwarm: true,
	modeSwarm: true,
	labelsSwarm: true,
	networkSwarm: true,
	replicas: true,
	applicationStatus: true,
	buildType: true,
	railpackVersion: true,
	herokuVersion: true,
	publishDirectory: true,
	isStaticSpa: true,
	createdAt: true,
	registryId: true,
	environmentId: true,
	githubId: true,
	gitlabId: true,
	giteaId: true,
	bitbucketId: true,
	serverId: true,
});

export const apiFindOneApplicationOutput = createSchema.extend({
	environment: environmentSelectSchema,
	domains: z.array(domainSelectSchema),
	deployments: z.array(deploymentSelectSchema),
	mounts: z.array(mountSelectSchema),
	redirects: z.array(redirectSelectSchema),
	security: z.array(securitySelectSchema),
	ports: z.array(portSelectSchema),

	registry: registrySelectSchema.nullable(),
	github: githubSelectSchema.nullable(),
	gitlab: gitlabSelectSchema.nullable(),
	bitbucket: bitbucketSelectSchema.nullable(),
	gitea: giteaSelectSchema.nullable(),
	server: serverSelectSchema.nullable(),

	previewDeployments: z.array(previewDeploymentSelectSchema),

	hasGitProviderAccess: z.boolean(),
	unauthorizedProvider: z
		.enum(["github", "gitlab", "bitbucket", "gitea"])
		.nullable(),
});

export const apiDeleteApplicationOutput = createSchema.extend({
	environment: environmentSelectSchema,
	domains: z.array(domainSelectSchema),
	deployments: z.array(deploymentSelectSchema),
	mounts: z.array(mountSelectSchema),
	redirects: z.array(redirectSelectSchema),
	security: z.array(securitySelectSchema),
	ports: z.array(portSelectSchema),

	registry: registrySelectSchema.nullable(),
	github: githubSelectSchema.nullable(),
	gitlab: gitlabSelectSchema.nullable(),
	bitbucket: bitbucketSelectSchema.nullable(),
	gitea: giteaSelectSchema.nullable(),
	server: serverSelectSchema.nullable(),

	previewDeployments: z.array(previewDeploymentSelectSchema),

	hasGitProviderAccess: z.boolean(),
	unauthorizedProvider: z
		.enum(["github", "gitlab", "bitbucket", "gitea"])
		.nullable(),
});

export const apiFindMonitoringStatsOutput = z.object({
	cpu: z.array(z.object({ value: z.string(), time: z.string() })),
	memory: z.array(
		z.object({
			value: z.object({ used: z.string(), total: z.string() }),
			time: z.string(),
		}),
	),
	disk: z.array(z.object({ value: z.unknown(), time: z.string() })),
	network: z.array(
		z.object({
			value: z.object({ inputMb: z.string(), outputMb: z.string() }),
			time: z.string(),
		}),
	),
	block: z.array(
		z.object({
			value: z.object({ readMb: z.string(), writeMb: z.string() }),
			time: z.string(),
		}),
	),
});

export const apiMoveApplicationOutput = createSchema.extend({
	environment: environmentSelectSchema,
	domains: z.array(domainSelectSchema),
	deployments: z.array(deploymentSelectSchema),
	mounts: z.array(mountSelectSchema),
	redirects: z.array(redirectSelectSchema),
	security: z.array(securitySelectSchema),
	ports: z.array(portSelectSchema),
});
