import { db } from "@dokploy/server/db";
import {
	type apiImportWorkflowRepository,
	type apiUpdateWorkflowRepository,
	type apiUpsertWorkflowSecret,
	server,
	workflowRepositories,
	workflowRuns,
	workflowSecrets,
	workflows,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { authGithub } from "../utils/providers/github";
import { parseWorkflow } from "../utils/workflows/parser";
import { findGithubById } from "./github";

export const DOKPLOY_WORKFLOWS_DIR = ".dokploy/workflows";
export const GITHUB_WORKFLOWS_DIR = ".github/workflows";

export type WorkflowRepository = typeof workflowRepositories.$inferSelect;

export type WorkflowFile = { path: string; content: string };

const isWorkflowFile = (name: string) =>
	name.endsWith(".yml") || name.endsWith(".yaml");

export const workflowDirectories = (repository: {
	runDokployWorkflows: boolean;
	runGithubWorkflows: boolean;
}) => [
	...(repository.runDokployWorkflows ? [DOKPLOY_WORKFLOWS_DIR] : []),
	...(repository.runGithubWorkflows ? [GITHUB_WORKFLOWS_DIR] : []),
];

export const fetchWorkflowFiles = async (
	octokit: ReturnType<typeof authGithub>,
	owner: string,
	repo: string,
	ref: string,
	directories: string[],
): Promise<WorkflowFile[]> => {
	const files: WorkflowFile[] = [];
	for (const directory of directories) {
		let entries: { type: string; path: string; name: string }[];
		try {
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo,
				path: directory,
				ref,
			});
			if (!Array.isArray(data)) continue;
			entries = data;
		} catch (error) {
			if ((error as { status?: number }).status === 404) continue;
			throw error;
		}

		for (const entry of entries) {
			if (entry.type !== "file" || !isWorkflowFile(entry.name)) continue;
			const { data } = await octokit.rest.repos.getContent({
				owner,
				repo,
				path: entry.path,
				ref,
				mediaType: { format: "raw" },
			});
			files.push({ path: entry.path, content: String(data) });
		}
	}
	return files;
};

export const findWorkflowRepositoryForOrganization = async (
	workflowRepositoryId: string,
	organizationId: string,
) => {
	const repository = await db.query.workflowRepositories.findFirst({
		where: and(
			eq(workflowRepositories.workflowRepositoryId, workflowRepositoryId),
			eq(workflowRepositories.organizationId, organizationId),
		),
		with: {
			github: { with: { gitProvider: true } },
			server: {
				columns: { serverId: true, name: true, serverType: true },
			},
		},
	});
	if (!repository) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workflow repository not found",
		});
	}
	return repository;
};

export const findWorkflowForOrganization = async (
	workflowId: string,
	organizationId: string,
) => {
	const workflow = await db.query.workflows.findFirst({
		where: eq(workflows.workflowId, workflowId),
		with: { repository: true },
	});
	if (!workflow || workflow.repository.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workflow not found",
		});
	}
	return workflow;
};

const assertWorkflowServer = async (
	serverId: string,
	organizationId: string,
) => {
	const target = await db.query.server.findFirst({
		where: and(
			eq(server.serverId, serverId),
			eq(server.organizationId, organizationId),
		),
		columns: { serverId: true, serverType: true },
	});
	if (!target) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
	}
	if (target.serverType !== "workflow") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Workflows can only run on servers of type Workflow",
		});
	}
};

export const syncWorkflowDefinitions = async (workflowRepositoryId: string) => {
	const repository = await db.query.workflowRepositories.findFirst({
		where: eq(workflowRepositories.workflowRepositoryId, workflowRepositoryId),
	});
	if (!repository) return;

	try {
		const githubProvider = await findGithubById(repository.githubId);
		const octokit = authGithub(githubProvider);
		const { data: repoInfo } = await octokit.rest.repos.get({
			owner: repository.owner,
			repo: repository.repository,
		});
		const defaultBranch = repoInfo.default_branch;
		const files = await fetchWorkflowFiles(
			octokit,
			repository.owner,
			repository.repository,
			defaultBranch,
			workflowDirectories(repository),
		);

		await db.transaction(async (tx) => {
			for (const file of files) {
				const fallbackName = file.path.split("/").pop() ?? file.path;
				let values: Omit<
					typeof workflows.$inferInsert,
					"workflowRepositoryId" | "path"
				>;
				try {
					const parsed = parseWorkflow(file.content, fallbackName);
					values = {
						name: parsed.name,
						triggers: parsed.triggerSummary,
						jobs: parsed.jobs,
						dispatchInputs: parsed.dispatchInputs,
						parseError: null,
					};
				} catch (error) {
					values = {
						name: fallbackName,
						triggers: [],
						jobs: [],
						dispatchInputs: [],
						parseError: error instanceof Error ? error.message : String(error),
					};
				}
				await tx
					.insert(workflows)
					.values({ workflowRepositoryId, path: file.path, ...values })
					.onConflictDoUpdate({
						target: [workflows.workflowRepositoryId, workflows.path],
						set: values,
					});
			}

			const paths = files.map((file) => file.path);
			await tx
				.delete(workflows)
				.where(
					paths.length > 0
						? and(
								eq(workflows.workflowRepositoryId, workflowRepositoryId),
								notInArray(workflows.path, paths),
							)
						: eq(workflows.workflowRepositoryId, workflowRepositoryId),
				);

			await tx
				.update(workflowRepositories)
				.set({
					defaultBranch,
					lastSyncedAt: new Date().toISOString(),
					syncError: null,
				})
				.where(
					eq(workflowRepositories.workflowRepositoryId, workflowRepositoryId),
				);
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await db
			.update(workflowRepositories)
			.set({ syncError: message, lastSyncedAt: new Date().toISOString() })
			.where(
				eq(workflowRepositories.workflowRepositoryId, workflowRepositoryId),
			);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not read the workflows from GitHub: ${message}`,
		});
	}
};

export const importWorkflowRepository = async (
	input: z.infer<typeof apiImportWorkflowRepository>,
	organizationId: string,
) => {
	if (input.serverId) {
		await assertWorkflowServer(input.serverId, organizationId);
	}

	const existing = await db.query.workflowRepositories.findFirst({
		where: and(
			eq(workflowRepositories.organizationId, organizationId),
			eq(workflowRepositories.githubId, input.githubId),
			eq(workflowRepositories.owner, input.owner),
			eq(workflowRepositories.repository, input.repository),
		),
	});
	if (existing) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "This repository is already imported",
		});
	}

	const [repository] = await db
		.insert(workflowRepositories)
		.values({
			githubId: input.githubId,
			owner: input.owner,
			repository: input.repository,
			serverId: input.serverId,
			organizationId,
		})
		.returning();

	if (!repository) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Error importing the repository",
		});
	}

	await syncWorkflowDefinitions(repository.workflowRepositoryId).catch(
		() => undefined,
	);
	return repository;
};

export const updateWorkflowRepository = async (
	input: z.infer<typeof apiUpdateWorkflowRepository>,
	organizationId: string,
) => {
	const { workflowRepositoryId, ...values } = input;
	const repository = await findWorkflowRepositoryForOrganization(
		workflowRepositoryId,
		organizationId,
	);
	if (values.serverId) {
		await assertWorkflowServer(values.serverId, organizationId);
	}

	await db
		.update(workflowRepositories)
		.set(values)
		.where(eq(workflowRepositories.workflowRepositoryId, workflowRepositoryId));

	const directoriesChanged =
		(values.runDokployWorkflows !== undefined &&
			values.runDokployWorkflows !== repository.runDokployWorkflows) ||
		(values.runGithubWorkflows !== undefined &&
			values.runGithubWorkflows !== repository.runGithubWorkflows);
	if (directoriesChanged) {
		await syncWorkflowDefinitions(workflowRepositoryId).catch(() => undefined);
	}
	return repository;
};

export const removeWorkflowRepository = async (
	workflowRepositoryId: string,
	organizationId: string,
) => {
	const repository = await findWorkflowRepositoryForOrganization(
		workflowRepositoryId,
		organizationId,
	);
	const active = await db.query.workflowRuns.findFirst({
		where: and(
			eq(workflowRuns.workflowRepositoryId, workflowRepositoryId),
			inArray(workflowRuns.status, ["queued", "running"]),
		),
		columns: { workflowRunId: true },
	});
	if (active) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cancel the queued and running runs before removing the repository",
		});
	}
	await db
		.delete(workflowRepositories)
		.where(eq(workflowRepositories.workflowRepositoryId, workflowRepositoryId));
	return repository;
};

export const listWorkflowRepositories = async (organizationId: string) => {
	const repositories = await db.query.workflowRepositories.findMany({
		where: eq(workflowRepositories.organizationId, organizationId),
		orderBy: desc(workflowRepositories.createdAt),
		with: {
			server: { columns: { serverId: true, name: true } },
			github: { columns: { githubId: true, githubUrl: true } },
		},
	});
	if (repositories.length === 0) return [];

	const ids = repositories.map((r) => r.workflowRepositoryId);
	const workflowCounts = await db
		.select({
			workflowRepositoryId: workflows.workflowRepositoryId,
			count: sql<number>`cast(count(*) as integer)`,
		})
		.from(workflows)
		.where(inArray(workflows.workflowRepositoryId, ids))
		.groupBy(workflows.workflowRepositoryId);

	const latestRuns = await db
		.selectDistinctOn([workflowRuns.workflowRepositoryId], {
			workflowRepositoryId: workflowRuns.workflowRepositoryId,
			status: workflowRuns.status,
			createdAt: workflowRuns.createdAt,
		})
		.from(workflowRuns)
		.where(inArray(workflowRuns.workflowRepositoryId, ids))
		.orderBy(workflowRuns.workflowRepositoryId, desc(workflowRuns.createdAt));

	return repositories.map((repository) => ({
		...repository,
		workflowCount:
			workflowCounts.find(
				(c) => c.workflowRepositoryId === repository.workflowRepositoryId,
			)?.count ?? 0,
		lastRun:
			latestRuns.find(
				(r) => r.workflowRepositoryId === repository.workflowRepositoryId,
			) ?? null,
	}));
};

export const listWorkflows = async (workflowRepositoryId: string) =>
	db.query.workflows.findMany({
		where: eq(workflows.workflowRepositoryId, workflowRepositoryId),
		orderBy: workflows.path,
	});

export const setWorkflowEnabled = async (
	workflowId: string,
	enabled: boolean,
) =>
	db
		.update(workflows)
		.set({ enabled })
		.where(eq(workflows.workflowId, workflowId));

export const listWorkflowSecrets = async (workflowRepositoryId: string) => {
	const rows = await db.query.workflowSecrets.findMany({
		where: eq(workflowSecrets.workflowRepositoryId, workflowRepositoryId),
		orderBy: workflowSecrets.name,
	});
	return rows.map((row) => ({
		workflowSecretId: row.workflowSecretId,
		name: row.name,
		type: row.type,
		createdAt: row.createdAt,
		value: row.type === "variable" ? row.value : null,
	}));
};

export const upsertWorkflowSecret = async (
	input: z.infer<typeof apiUpsertWorkflowSecret>,
) => {
	await db
		.insert(workflowSecrets)
		.values(input)
		.onConflictDoUpdate({
			target: [
				workflowSecrets.workflowRepositoryId,
				workflowSecrets.type,
				workflowSecrets.name,
			],
			set: { value: input.value },
		});
};

export const findWorkflowSecretForOrganization = async (
	workflowSecretId: string,
	organizationId: string,
) => {
	const secret = await db.query.workflowSecrets.findFirst({
		where: eq(workflowSecrets.workflowSecretId, workflowSecretId),
		with: { repository: { columns: { organizationId: true } } },
	});
	if (!secret || secret.repository.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" });
	}
	return secret;
};

export const removeWorkflowSecret = async (workflowSecretId: string) =>
	db
		.delete(workflowSecrets)
		.where(eq(workflowSecrets.workflowSecretId, workflowSecretId));

export const loadWorkflowSecrets = async (workflowRepositoryId: string) => {
	const rows = await db.query.workflowSecrets.findMany({
		where: eq(workflowSecrets.workflowRepositoryId, workflowRepositoryId),
	});
	const secrets: Record<string, string> = {};
	const variables: Record<string, string> = {};
	for (const row of rows) {
		if (row.type === "secret") secrets[row.name] = row.value;
		else variables[row.name] = row.value;
	}
	return { secrets, variables };
};
