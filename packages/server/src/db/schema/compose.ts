import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { bitbucket } from "./bitbucket";
import { deployments } from "./deployment";
import { domains } from "./domain";
import { github } from "./github";
import { gitlab } from "./gitlab";
import { mounts } from "./mount";
import { projects } from "./project";
import { server } from "./server";
import { applicationStatus } from "./shared";
import { sshKeys } from "./ssh-key";
import { generateAppName } from "./utils";

export const sourceTypeCompose = pgEnum("sourceTypeCompose", [
	"git",
	"github",
	"gitlab",
	"bitbucket",
	"raw",
]);

export const composeType = pgEnum("composeType", ["docker-compose", "stack"]);

export const compose = pgTable("compose", {
	composeId: text("composeId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("compose")),
	description: text("description"),
	env: text("env"),
	composeFile: text("composeFile").notNull().default(""),
	refreshToken: text("refreshToken").$defaultFn(() => nanoid()),
	sourceType: sourceTypeCompose("sourceType").notNull().default("github"),
	composeType: composeType("composeType").notNull().default("docker-compose"),
	// Github
	repository: text("repository"),
	owner: text("owner"),
	branch: text("branch"),
	autoDeploy: boolean("autoDeploy").$defaultFn(() => true),
	// Gitlab
	gitlabProjectId: integer("gitlabProjectId"),
	gitlabRepository: text("gitlabRepository"),
	gitlabOwner: text("gitlabOwner"),
	gitlabBranch: text("gitlabBranch"),
	gitlabPathNamespace: text("gitlabPathNamespace"),
	// Bitbucket
	bitbucketRepository: text("bitbucketRepository"),
	bitbucketOwner: text("bitbucketOwner"),
	bitbucketBranch: text("bitbucketBranch"),
	// Git
	customGitUrl: text("customGitUrl"),
	customGitBranch: text("customGitBranch"),
	customGitSSHKeyId: text("customGitSSHKeyId").references(
		() => sshKeys.sshKeyId,
		{
			onDelete: "set null",
		},
	),
	command: text("command").notNull().default(""),
	//
	composePath: text("composePath").notNull().default("./docker-compose.yml"),
	suffix: text("suffix").notNull().default(""),
	randomize: boolean("randomize").notNull().default(false),
	composeStatus: applicationStatus("composeStatus").notNull().default("idle"),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),

	githubId: text("githubId").references(() => github.githubId, {
		onDelete: "set null",
	}),
	gitlabId: text("gitlabId").references(() => gitlab.gitlabId, {
		onDelete: "set null",
	}),
	bitbucketId: text("bitbucketId").references(() => bitbucket.bitbucketId, {
		onDelete: "set null",
	}),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const composeRelations = relations(compose, ({ one, many }) => ({
	project: one(projects, {
		fields: [compose.projectId],
		references: [projects.projectId],
	}),
	deployments: many(deployments),
	mounts: many(mounts),
	customGitSSHKey: one(sshKeys, {
		fields: [compose.customGitSSHKeyId],
		references: [sshKeys.sshKeyId],
	}),
	domains: many(domains),
	github: one(github, {
		fields: [compose.githubId],
		references: [github.githubId],
	}),
	gitlab: one(gitlab, {
		fields: [compose.gitlabId],
		references: [gitlab.gitlabId],
	}),
	bitbucket: one(bitbucket, {
		fields: [compose.bitbucketId],
		references: [bitbucket.bitbucketId],
	}),
	server: one(server, {
		fields: [compose.serverId],
		references: [server.serverId],
	}),
}));

const createSchema = createInsertSchema(compose, {
	name: z.string().min(1),
	description: z.string(),
	env: z.string().optional(),
	composeFile: z.string().min(1),
	projectId: z.string(),
	customGitSSHKeyId: z.string().optional(),
	command: z.string().optional(),
	composePath: z.string().min(1),
	composeType: z.enum(["docker-compose", "stack"]).optional(),
});

export const apiCreateCompose = createSchema.pick({
	name: true,
	description: true,
	projectId: true,
	composeType: true,
	appName: true,
	serverId: true,
});

export const apiCreateComposeByTemplate = createSchema
	.pick({
		projectId: true,
	})
	.extend({
		id: z.string().min(1),
		serverId: z.string().optional(),
	});

export const apiFindCompose = z.object({
	composeId: z.string().min(1),
});

export const apiFetchServices = z.object({
	composeId: z.string().min(1),
	type: z.enum(["fetch", "cache"]).optional().default("cache"),
});

export const apiUpdateCompose = createSchema
	.partial()
	.extend({
		composeId: z.string(),
		composeFile: z.string().optional(),
		command: z.string().optional(),
	})
	.omit({ serverId: true });

export const apiRandomizeCompose = createSchema
	.pick({
		composeId: true,
	})
	.extend({
		suffix: z.string().optional(),
		composeId: z.string().min(1),
	});
