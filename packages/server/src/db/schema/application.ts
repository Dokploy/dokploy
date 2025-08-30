import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	json,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { bitbucket } from "./bitbucket";
import { deployments } from "./deployment";
import { domains } from "./domain";
import { gitea } from "./gitea";
import { github } from "./github";
import { gitlab } from "./gitlab";
import { mounts } from "./mount";
import { ports } from "./port";
import { previewDeployments } from "./preview-deployments";
import { projects } from "./project";
import { redirects } from "./redirects";
import { registry } from "./registry";
import { security } from "./security";
import { server } from "./server";
import {
	applicationStatus,
	certificateType,
	type HealthCheckSwarm,
	HealthCheckSwarmSchema,
	type LabelsSwarm,
	LabelsSwarmSchema,
	type NetworkSwarm,
	NetworkSwarmSchema,
	type PlacementSwarm,
	PlacementSwarmSchema,
	type RestartPolicySwarm,
	RestartPolicySwarmSchema,
	type ServiceModeSwarm,
	ServiceModeSwarmSchema,
	triggerType,
	type UpdateConfigSwarm,
	UpdateConfigSwarmSchema,
} from "./shared";
import { sshKeys } from "./ssh-key";
import { generateAppName } from "./utils";
export const sourceType = pgEnum("sourceType", [
	"docker",
	"git",
	"github",
	"gitlab",
	"bitbucket",
	"gitea",
	"drop",
]);

export const buildType = pgEnum("buildType", [
	"dockerfile",
	"heroku_buildpacks",
	"paketo_buildpacks",
	"nixpacks",
	"static",
	"railpack",
]);

export const applications = pgTable("application", {
	applicationId: text("applicationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("app"))
		.unique(),
	description: text("description"),
	env: text("env"),
	previewEnv: text("previewEnv"),
	watchPaths: text("watchPaths").array(),
	previewBuildArgs: text("previewBuildArgs"),
	previewLabels: text("previewLabels").array(),
	previewWildcard: text("previewWildcard"),
	previewPort: integer("previewPort").default(3000),
	previewHttps: boolean("previewHttps").notNull().default(false),
	previewPath: text("previewPath").default("/"),
	previewCertificateType: certificateType("certificateType")
		.notNull()
		.default("none"),
	previewCustomCertResolver: text("previewCustomCertResolver"),
	previewLimit: integer("previewLimit").default(3),
	isPreviewDeploymentsActive: boolean("isPreviewDeploymentsActive").default(
		false,
	),
	// Security: Require collaborator permissions for preview deployments
	previewRequireCollaboratorPermissions: boolean(
		"previewRequireCollaboratorPermissions",
	).default(true),
	rollbackActive: boolean("rollbackActive").default(false),
	buildArgs: text("buildArgs"),
	memoryReservation: text("memoryReservation"),
	memoryLimit: text("memoryLimit"),
	cpuReservation: text("cpuReservation"),
	cpuLimit: text("cpuLimit"),
	title: text("title"),
	enabled: boolean("enabled"),
	subtitle: text("subtitle"),
	command: text("command"),
	refreshToken: text("refreshToken").$defaultFn(() => nanoid()),
	sourceType: sourceType("sourceType").notNull().default("github"),
	cleanCache: boolean("cleanCache").default(false),
	// Github
	repository: text("repository"),
	owner: text("owner"),
	branch: text("branch"),
	buildPath: text("buildPath").default("/"),
	triggerType: triggerType("triggerType").default("push"),
	autoDeploy: boolean("autoDeploy").$defaultFn(() => true),
	// Gitlab
	gitlabProjectId: integer("gitlabProjectId"),
	gitlabRepository: text("gitlabRepository"),
	gitlabOwner: text("gitlabOwner"),
	gitlabBranch: text("gitlabBranch"),
	gitlabBuildPath: text("gitlabBuildPath").default("/"),
	gitlabPathNamespace: text("gitlabPathNamespace"),
	// Gitea
	giteaRepository: text("giteaRepository"),
	giteaOwner: text("giteaOwner"),
	giteaBranch: text("giteaBranch"),
	giteaBuildPath: text("giteaBuildPath").default("/"),
	// Bitbucket
	bitbucketRepository: text("bitbucketRepository"),
	bitbucketOwner: text("bitbucketOwner"),
	bitbucketBranch: text("bitbucketBranch"),
	bitbucketBuildPath: text("bitbucketBuildPath").default("/"),
	// Docker
	username: text("username"),
	password: text("password"),
	dockerImage: text("dockerImage"),
	registryUrl: text("registryUrl"),
	// Git
	customGitUrl: text("customGitUrl"),
	customGitBranch: text("customGitBranch"),
	customGitBuildPath: text("customGitBuildPath"),
	customGitSSHKeyId: text("customGitSSHKeyId").references(
		() => sshKeys.sshKeyId,
		{
			onDelete: "set null",
		},
	),
	enableSubmodules: boolean("enableSubmodules").notNull().default(false),
	dockerfile: text("dockerfile"),
	dockerContextPath: text("dockerContextPath"),
	dockerBuildStage: text("dockerBuildStage"),
	// Drop
	dropBuildPath: text("dropBuildPath"),
	// Docker swarm json
	healthCheckSwarm: json("healthCheckSwarm").$type<HealthCheckSwarm>(),
	restartPolicySwarm: json("restartPolicySwarm").$type<RestartPolicySwarm>(),
	placementSwarm: json("placementSwarm").$type<PlacementSwarm>(),
	updateConfigSwarm: json("updateConfigSwarm").$type<UpdateConfigSwarm>(),
	rollbackConfigSwarm: json("rollbackConfigSwarm").$type<UpdateConfigSwarm>(),
	modeSwarm: json("modeSwarm").$type<ServiceModeSwarm>(),
	labelsSwarm: json("labelsSwarm").$type<LabelsSwarm>(),
	networkSwarm: json("networkSwarm").$type<NetworkSwarm[]>(),
	//
	replicas: integer("replicas").default(1).notNull(),
	applicationStatus: applicationStatus("applicationStatus")
		.notNull()
		.default("idle"),
	buildType: buildType("buildType").notNull().default("nixpacks"),
	railpackVersion: text("railpackVersion").default("0.2.2"),
	herokuVersion: text("herokuVersion").default("24"),
	publishDirectory: text("publishDirectory"),
	isStaticSpa: boolean("isStaticSpa"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	registryId: text("registryId").references(() => registry.registryId, {
		onDelete: "set null",
	}),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
	githubId: text("githubId").references(() => github.githubId, {
		onDelete: "set null",
	}),
	gitlabId: text("gitlabId").references(() => gitlab.gitlabId, {
		onDelete: "set null",
	}),
	giteaId: text("giteaId").references(() => gitea.giteaId, {
		onDelete: "set null",
	}),
	bitbucketId: text("bitbucketId").references(() => bitbucket.bitbucketId, {
		onDelete: "set null",
	}),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const applicationsRelations = relations(
	applications,
	({ one, many }) => ({
		project: one(projects, {
			fields: [applications.projectId],
			references: [projects.projectId],
		}),
		deployments: many(deployments),
		customGitSSHKey: one(sshKeys, {
			fields: [applications.customGitSSHKeyId],
			references: [sshKeys.sshKeyId],
		}),
		domains: many(domains),
		mounts: many(mounts),
		redirects: many(redirects),
		security: many(security),
		ports: many(ports),
		registry: one(registry, {
			fields: [applications.registryId],
			references: [registry.registryId],
		}),
		github: one(github, {
			fields: [applications.githubId],
			references: [github.githubId],
		}),
		gitlab: one(gitlab, {
			fields: [applications.gitlabId],
			references: [gitlab.gitlabId],
		}),
		gitea: one(gitea, {
			fields: [applications.giteaId],
			references: [gitea.giteaId],
		}),
		bitbucket: one(bitbucket, {
			fields: [applications.bitbucketId],
			references: [bitbucket.bitbucketId],
		}),
		server: one(server, {
			fields: [applications.serverId],
			references: [server.serverId],
		}),
		previewDeployments: many(previewDeployments),
	}),
);

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
	projectId: z.string(),
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

export const apiCreateApplication = createSchema.pick({
	name: true,
	appName: true,
	description: true,
	projectId: true,
	serverId: true,
});

export const apiFindOneApplication = createSchema
	.pick({
		applicationId: true,
	})
	.required();

export const apiReloadApplication = createSchema
	.pick({
		appName: true,
		applicationId: true,
	})
	.required();

export const apiSaveBuildType = createSchema
	.pick({
		applicationId: true,
		buildType: true,
		dockerfile: true,
		dockerContextPath: true,
		dockerBuildStage: true,
		herokuVersion: true,
		railpackVersion: true,
	})
	.required()
	.merge(createSchema.pick({ publishDirectory: true, isStaticSpa: true }));

export const apiSaveGithubProvider = createSchema
	.pick({
		applicationId: true,
		repository: true,
		branch: true,
		owner: true,
		buildPath: true,
		githubId: true,
		watchPaths: true,
		enableSubmodules: true,
	})
	.required()
	.extend({
		triggerType: z.enum(["push", "tag"]).default("push"),
	});

export const apiSaveGitlabProvider = createSchema
	.pick({
		applicationId: true,
		gitlabBranch: true,
		gitlabBuildPath: true,
		gitlabOwner: true,
		gitlabRepository: true,
		gitlabId: true,
		gitlabProjectId: true,
		gitlabPathNamespace: true,
		watchPaths: true,
		enableSubmodules: true,
	})
	.required();

export const apiSaveBitbucketProvider = createSchema
	.pick({
		bitbucketBranch: true,
		bitbucketBuildPath: true,
		bitbucketOwner: true,
		bitbucketRepository: true,
		bitbucketId: true,
		applicationId: true,
		watchPaths: true,
		enableSubmodules: true,
	})
	.required();

export const apiSaveGiteaProvider = createSchema
	.pick({
		applicationId: true,
		giteaBranch: true,
		giteaBuildPath: true,
		giteaOwner: true,
		giteaRepository: true,
		giteaId: true,
		watchPaths: true,
		enableSubmodules: true,
	})
	.required();

export const apiSaveDockerProvider = createSchema
	.pick({
		dockerImage: true,
		applicationId: true,
		username: true,
		password: true,
		registryUrl: true,
	})
	.required();

export const apiSaveGitProvider = createSchema
	.pick({
		customGitBranch: true,
		applicationId: true,
		customGitBuildPath: true,
		customGitUrl: true,
		watchPaths: true,
		enableSubmodules: true,
	})
	.required()
	.merge(
		createSchema.pick({
			customGitSSHKeyId: true,
		}),
	);

export const apiSaveEnvironmentVariables = createSchema
	.pick({
		applicationId: true,
		env: true,
		buildArgs: true,
	})
	.required();

export const apiFindMonitoringStats = createSchema
	.pick({
		appName: true,
	})
	.required();

export const apiUpdateApplication = createSchema
	.partial()
	.extend({
		applicationId: z.string().min(1),
	})
	.omit({ serverId: true });
