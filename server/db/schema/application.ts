import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { deployments } from "./deployment";
import { mounts } from "./mount";
import { redirects } from "./redirects";
import { domains } from "./domain";
import { projects } from "./project";
import { security } from "./security";
import { applicationStatus } from "./shared";
import { ports } from "./port";
import {
	boolean,
	integer,
	json,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { generateAppName } from "./utils";
import { registry } from "./registry";
import { generatePassword } from "@/templates/utils";

export const sourceType = pgEnum("sourceType", ["docker", "git", "github"]);

export const buildType = pgEnum("buildType", [
	"dockerfile",
	"heroku_buildpacks",
	"paketo_buildpacks",
	"nixpacks",
]);

// TODO: refactor this types
interface HealthCheckSwarm {
	Test?: string[] | undefined;
	Interval?: number | undefined;
	Timeout?: number | undefined;
	StartPeriod?: number | undefined;
	Retries?: number | undefined;
}

interface RestartPolicySwarm {
	Condition?: string | undefined;
	Delay?: number | undefined;
	MaxAttempts?: number | undefined;
	Window?: number | undefined;
}

interface PlacementSwarm {
	Constraints?: string[] | undefined;
	Preferences?: Array<{ Spread: { SpreadDescriptor: string } }> | undefined;
	MaxReplicas?: number | undefined;
	Platforms?:
		| Array<{
				Architecture: string;
				OS: string;
		  }>
		| undefined;
}

interface UpdateConfigSwarm {
	Parallelism: number;
	Delay?: number | undefined;
	FailureAction?: string | undefined;
	Monitor?: number | undefined;
	MaxFailureRatio?: number | undefined;
	Order: string;
}

interface ServiceModeSwarm {
	Replicated?: { Replicas?: number | undefined } | undefined;
	Global?: {} | undefined;
	ReplicatedJob?:
		| {
				MaxConcurrent?: number | undefined;
				TotalCompletions?: number | undefined;
		  }
		| undefined;
	GlobalJob?: {} | undefined;
}

interface NetworkSwarm {
	Target?: string | undefined;
	Aliases?: string[] | undefined;
	DriverOpts?: { [key: string]: string } | undefined;
}

interface LabelsSwarm {
	[name: string]: string;
}

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
	memoryReservation: integer("memoryReservation"),
	memoryLimit: integer("memoryLimit"),
	cpuReservation: integer("cpuReservation"),
	cpuLimit: integer("cpuLimit"),
	title: text("title"),
	enabled: boolean("enabled"),
	subtitle: text("subtitle"),
	command: text("command"),
	refreshToken: text("refreshToken").$defaultFn(() => nanoid()),
	sourceType: sourceType("sourceType").notNull().default("github"),
	// Github
	repository: text("repository"),
	owner: text("owner"),
	branch: text("branch"),
	buildPath: text("buildPath").default("/"),
	autoDeploy: boolean("autoDeploy"),
	// Docker
	username: text("username"),
	password: text("password"),
	dockerImage: text("dockerImage"),
	// Git
	customGitUrl: text("customGitUrl"),
	customGitBranch: text("customGitBranch"),
	customGitBuildPath: text("customGitBuildPath"),
	customGitSSHKey: text("customGitSSHKey"),
	dockerfile: text("dockerfile"),
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
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	registryId: text("registryId").references(() => registry.registryId, {
		onDelete: "set null",
	}),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
});

export const applicationsRelations = relations(
	applications,
	({ one, many }) => ({
		project: one(projects, {
			fields: [applications.projectId],
			references: [projects.projectId],
		}),
		deployments: many(deployments),
		domains: many(domains),
		mounts: many(mounts),
		redirects: many(redirects),
		security: many(security),
		ports: many(ports),
		registry: one(registry, {
			fields: [applications.registryId],
			references: [registry.registryId],
		}),
	}),
);

const HealthCheckSwarmSchema = z
	.object({
		Test: z.array(z.string()).optional(),
		Interval: z.number().optional(),
		Timeout: z.number().optional(),
		StartPeriod: z.number().optional(),
		Retries: z.number().optional(),
	})
	.strict();

const RestartPolicySwarmSchema = z
	.object({
		Condition: z.string().optional(),
		Delay: z.number().optional(),
		MaxAttempts: z.number().optional(),
		Window: z.number().optional(),
	})
	.strict();

const PreferenceSchema = z
	.object({
		Spread: z.object({
			SpreadDescriptor: z.string(),
		}),
	})
	.strict();

const PlatformSchema = z
	.object({
		Architecture: z.string(),
		OS: z.string(),
	})
	.strict();

const PlacementSwarmSchema = z
	.object({
		Constraints: z.array(z.string()).optional(),
		Preferences: z.array(PreferenceSchema).optional(),
		MaxReplicas: z.number().optional(),
		Platforms: z.array(PlatformSchema).optional(),
	})
	.strict();

const UpdateConfigSwarmSchema = z
	.object({
		Parallelism: z.number(),
		Delay: z.number().optional(),
		FailureAction: z.string().optional(),
		Monitor: z.number().optional(),
		MaxFailureRatio: z.number().optional(),
		Order: z.string(),
	})
	.strict();

const ReplicatedSchema = z
	.object({
		Replicas: z.number().optional(),
	})
	.strict();

const ReplicatedJobSchema = z
	.object({
		MaxConcurrent: z.number().optional(),
		TotalCompletions: z.number().optional(),
	})
	.strict();

const ServiceModeSwarmSchema = z
	.object({
		Replicated: ReplicatedSchema.optional(),
		Global: z.object({}).optional(),
		ReplicatedJob: ReplicatedJobSchema.optional(),
		GlobalJob: z.object({}).optional(),
	})
	.strict();

const NetworkSwarmSchema = z.array(
	z
		.object({
			Target: z.string().optional(),
			Aliases: z.array(z.string()).optional(),
			DriverOpts: z.object({}).optional(),
		})
		.strict(),
);

const LabelsSwarmSchema = z.record(z.string());

const createSchema = createInsertSchema(applications, {
	appName: z.string(),
	createdAt: z.string(),
	applicationId: z.string(),
	autoDeploy: z.boolean(),
	env: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	memoryReservation: z.number().optional(),
	memoryLimit: z.number().optional(),
	cpuReservation: z.number().optional(),
	cpuLimit: z.number().optional(),
	title: z.string().optional(),
	enabled: z.boolean().optional(),
	subtitle: z.string().optional(),
	dockerImage: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
	customGitSSHKey: z.string().optional(),
	repository: z.string().optional(),
	dockerfile: z.string().optional(),
	branch: z.string().optional(),
	customGitBranch: z.string().optional(),
	customGitBuildPath: z.string().optional(),
	customGitUrl: z.string().optional(),
	buildPath: z.string().optional(),
	projectId: z.string(),
	sourceType: z.enum(["github", "docker", "git"]).optional(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	buildType: z.enum([
		"dockerfile",
		"heroku_buildpacks",
		"paketo_buildpacks",
		"nixpacks",
	]),
	owner: z.string(),
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
});

export const apiCreateApplication = createSchema.pick({
	name: true,
	appName: true,
	description: true,
	projectId: true,
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
	})
	.required();

export const apiSaveGithubProvider = createSchema
	.pick({
		applicationId: true,
		repository: true,
		branch: true,
		owner: true,
		buildPath: true,
	})
	.required();

export const apiSaveDockerProvider = createSchema
	.pick({
		dockerImage: true,
		applicationId: true,
		username: true,
		password: true,
	})
	.required();

export const apiSaveGitProvider = createSchema
	.pick({
		customGitBranch: true,
		applicationId: true,
		customGitBuildPath: true,
		customGitUrl: true,
	})
	.required();

export const apiSaveEnvironmentVariables = createSchema
	.pick({
		applicationId: true,
		env: true,
	})
	.required();

export const apiFindMonitoringStats = createSchema
	.pick({
		appName: true,
	})
	.required();

export const apiUpdateApplication = createSchema.partial().extend({
	applicationId: z.string().min(1),
});
