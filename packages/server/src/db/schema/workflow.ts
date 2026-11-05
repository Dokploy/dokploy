import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { github } from "./github";
import { server } from "./server";
import { encryptedText } from "./utils";

export const workflowRunStatus = pgEnum("workflowRunStatus", [
	"queued",
	"running",
	"success",
	"failure",
	"cancelled",
	"skipped",
]);

export const workflowSecretType = pgEnum("workflowSecretType", [
	"secret",
	"variable",
]);

export type WorkflowTriggerSummary = {
	event: string;
	branches?: string[];
	tags?: string[];
};

export type WorkflowJobSummary = {
	id: string;
	name: string;
	runsOn: string[];
};

export type WorkflowDispatchInput = {
	name: string;
	description?: string;
	required?: boolean;
	default?: string;
	type?: string;
	options?: string[];
};

export const workflowRepositories = pgTable(
	"workflow_repository",
	{
		workflowRepositoryId: text("workflowRepositoryId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		owner: text("owner").notNull(),
		repository: text("repository").notNull(),
		defaultBranch: text("defaultBranch").notNull().default("main"),
		runDokployWorkflows: boolean("runDokployWorkflows").notNull().default(true),
		runGithubWorkflows: boolean("runGithubWorkflows").notNull().default(false),
		lastSyncedAt: text("lastSyncedAt"),
		syncError: text("syncError"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		githubId: text("githubId")
			.notNull()
			.references(() => github.githubId, { onDelete: "cascade" }),
		serverId: text("serverId").references(() => server.serverId, {
			onDelete: "set null",
		}),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique("workflow_repository_org_repo_unique").on(
			t.organizationId,
			t.githubId,
			t.owner,
			t.repository,
		),
	],
);

export const workflows = pgTable(
	"workflow",
	{
		workflowId: text("workflowId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		path: text("path").notNull(),
		name: text("name").notNull(),
		triggers: jsonb("triggers")
			.$type<WorkflowTriggerSummary[]>()
			.notNull()
			.default([]),
		jobs: jsonb("jobs").$type<WorkflowJobSummary[]>().notNull().default([]),
		dispatchInputs: jsonb("dispatchInputs")
			.$type<WorkflowDispatchInput[]>()
			.notNull()
			.default([]),
		parseError: text("parseError"),
		enabled: boolean("enabled").notNull().default(true),
		workflowRepositoryId: text("workflowRepositoryId")
			.notNull()
			.references(() => workflowRepositories.workflowRepositoryId, {
				onDelete: "cascade",
			}),
	},
	(t) => [
		unique("workflow_repository_path_unique").on(
			t.workflowRepositoryId,
			t.path,
		),
	],
);

export const workflowRuns = pgTable(
	"workflow_run",
	{
		workflowRunId: text("workflowRunId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		runNumber: integer("runNumber").notNull(),
		attempt: integer("attempt").notNull().default(1),
		workflowPath: text("workflowPath").notNull(),
		workflowName: text("workflowName").notNull(),
		event: text("event").notNull(),
		eventAction: text("eventAction"),
		ref: text("ref").notNull(),
		branch: text("branch"),
		sha: text("sha").notNull(),
		title: text("title").notNull().default(""),
		actor: text("actor"),
		pullRequestNumber: integer("pullRequestNumber"),
		payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
		inputs: jsonb("inputs").$type<Record<string, string>>(),
		targetJob: text("targetJob"),
		status: workflowRunStatus("status").notNull().default("queued"),
		exitCode: integer("exitCode"),
		errorMessage: text("errorMessage"),
		logPath: text("logPath"),
		checkRunId: text("checkRunId"),
		cancelRequested: boolean("cancelRequested").notNull().default(false),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		startedAt: text("startedAt"),
		finishedAt: text("finishedAt"),
		workflowId: text("workflowId").references(() => workflows.workflowId, {
			onDelete: "set null",
		}),
		workflowRepositoryId: text("workflowRepositoryId")
			.notNull()
			.references(() => workflowRepositories.workflowRepositoryId, {
				onDelete: "cascade",
			}),
		serverId: text("serverId").references(() => server.serverId, {
			onDelete: "set null",
		}),
	},
	(t) => [
		index("workflow_run_repository_idx").on(
			t.workflowRepositoryId,
			t.createdAt,
		),
		index("workflow_run_status_idx").on(t.status),
	],
);

export const workflowSecrets = pgTable(
	"workflow_secret",
	{
		workflowSecretId: text("workflowSecretId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		value: encryptedText("value").notNull(),
		type: workflowSecretType("type").notNull().default("secret"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		workflowRepositoryId: text("workflowRepositoryId")
			.notNull()
			.references(() => workflowRepositories.workflowRepositoryId, {
				onDelete: "cascade",
			}),
	},
	(t) => [
		unique("workflow_secret_name_unique").on(
			t.workflowRepositoryId,
			t.type,
			t.name,
		),
	],
);

export const workflowRepositoryRelations = relations(
	workflowRepositories,
	({ one, many }) => ({
		github: one(github, {
			fields: [workflowRepositories.githubId],
			references: [github.githubId],
		}),
		server: one(server, {
			fields: [workflowRepositories.serverId],
			references: [server.serverId],
		}),
		organization: one(organization, {
			fields: [workflowRepositories.organizationId],
			references: [organization.id],
		}),
		workflows: many(workflows),
		runs: many(workflowRuns),
		secrets: many(workflowSecrets),
	}),
);

export const workflowRelations = relations(workflows, ({ one, many }) => ({
	repository: one(workflowRepositories, {
		fields: [workflows.workflowRepositoryId],
		references: [workflowRepositories.workflowRepositoryId],
	}),
	runs: many(workflowRuns),
}));

export const workflowRunRelations = relations(workflowRuns, ({ one }) => ({
	repository: one(workflowRepositories, {
		fields: [workflowRuns.workflowRepositoryId],
		references: [workflowRepositories.workflowRepositoryId],
	}),
	workflow: one(workflows, {
		fields: [workflowRuns.workflowId],
		references: [workflows.workflowId],
	}),
	server: one(server, {
		fields: [workflowRuns.serverId],
		references: [server.serverId],
	}),
}));

export const workflowSecretRelations = relations(
	workflowSecrets,
	({ one }) => ({
		repository: one(workflowRepositories, {
			fields: [workflowSecrets.workflowRepositoryId],
			references: [workflowRepositories.workflowRepositoryId],
		}),
	}),
);

const SECRET_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const apiImportWorkflowRepository = z.object({
	githubId: z.string().min(1),
	owner: z.string().min(1),
	repository: z.string().min(1),
	serverId: z.string().min(1).nullable(),
});

export const apiFindWorkflowRepository = z.object({
	workflowRepositoryId: z.string().min(1),
});

export const apiUpdateWorkflowRepository = z.object({
	workflowRepositoryId: z.string().min(1),
	serverId: z.string().min(1).nullable().optional(),
	runDokployWorkflows: z.boolean().optional(),
	runGithubWorkflows: z.boolean().optional(),
});

export const apiToggleWorkflow = z.object({
	workflowId: z.string().min(1),
	enabled: z.boolean(),
});

export const apiDispatchWorkflow = z.object({
	workflowId: z.string().min(1),
	branch: z.string().min(1),
	inputs: z.record(z.string(), z.string()).optional(),
	targetJob: z.string().min(1).optional(),
});

export const apiFindWorkflowRun = z.object({
	workflowRunId: z.string().min(1),
});

export const apiListWorkflowRuns = z.object({
	workflowRepositoryId: z.string().min(1).optional(),
	status: z.enum(workflowRunStatus.enumValues).optional(),
	search: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(25),
	offset: z.number().int().min(0).default(0),
});

export const apiUpsertWorkflowSecret = z.object({
	workflowRepositoryId: z.string().min(1),
	name: z
		.string()
		.min(1)
		.max(100)
		.regex(SECRET_NAME_REGEX, "Use letters, numbers and underscores only")
		.refine((name) => !name.toUpperCase().startsWith("GITHUB_"), {
			message: "Names starting with GITHUB_ are reserved",
		}),
	value: z.string(),
	type: z.enum(workflowSecretType.enumValues),
});

export const apiRemoveWorkflowSecret = z.object({
	workflowSecretId: z.string().min(1),
});
