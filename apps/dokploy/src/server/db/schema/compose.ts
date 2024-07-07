import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./project";
import { relations } from "drizzle-orm";
import { deployments } from "./deployment";
import { generateAppName } from "./utils";
import { applicationStatus } from "./shared";
import { mounts } from "./mount";
import { generatePassword } from "@/templates/utils";

export const sourceTypeCompose = pgEnum("sourceTypeCompose", [
	"git",
	"github",
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
	autoDeploy: boolean("autoDeploy"),
	// Git
	customGitUrl: text("customGitUrl"),
	customGitBranch: text("customGitBranch"),
	customGitSSHKey: text("customGitSSHKey"),
	//
	command: text("command").notNull().default(""),
	//
	composePath: text("composePath").notNull().default("./docker-compose.yml"),
	composeStatus: applicationStatus("composeStatus").notNull().default("idle"),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const composeRelations = relations(compose, ({ one, many }) => ({
	project: one(projects, {
		fields: [compose.projectId],
		references: [projects.projectId],
	}),
	deployments: many(deployments),
	mounts: many(mounts),
}));

const createSchema = createInsertSchema(compose, {
	name: z.string().min(1),
	description: z.string(),
	env: z.string().optional(),
	composeFile: z.string().min(1),
	projectId: z.string(),
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
});

export const apiCreateComposeByTemplate = createSchema
	.pick({
		projectId: true,
	})
	.extend({
		id: z.string().min(1),
	});

export const apiFindCompose = z.object({
	composeId: z.string().min(1),
});

export const apiUpdateCompose = createSchema.partial().extend({
	composeId: z.string(),
	composeFile: z.string().optional(),
	command: z.string().optional(),
});

export const apiRandomizeCompose = createSchema
	.pick({
		composeId: true,
	})
	.extend({
		prefix: z.string().optional(),
		composeId: z.string().min(1),
	});
