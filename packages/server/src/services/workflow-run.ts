import { db } from "@dokploy/server/db";
import {
	server,
	workflowRepositories,
	type workflowRunStatus,
	workflowRuns,
	workflows,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { execAsyncRemote } from "../utils/process/execAsync";
import { authGithub, normalizeGithubUrl } from "../utils/providers/github";
import {
	buildActCancelScript,
	buildActCleanupScript,
	buildActStartScript,
	buildActStatusScript,
	workflowRunLogPath,
} from "../utils/workflows/act";
import {
	parseWorkflow,
	type WorkflowEvent,
	workflowMatchesEvent,
} from "../utils/workflows/parser";
import { getDokployUrl } from "./admin";
import { findGithubById, type Github } from "./github";
import {
	fetchWorkflowFiles,
	loadWorkflowSecrets,
	syncWorkflowDefinitions,
	workflowDirectories,
} from "./workflow";

type WorkflowRun = typeof workflowRuns.$inferSelect;
type WorkflowRunStatus = (typeof workflowRunStatus.enumValues)[number];

const FINISHED_STATUSES: WorkflowRunStatus[] = [
	"success",
	"failure",
	"cancelled",
	"skipped",
];

const MONITOR_INTERVAL_MS = 5_000;
const MAX_RUN_DURATION_MS = 6 * 60 * 60 * 1000;

const SKIP_CI_KEYWORDS = [
	"[skip ci]",
	"[ci skip]",
	"[no ci]",
	"[skip actions]",
	"[actions skip]",
];

const githubHost = (githubProvider: Github) =>
	new URL(normalizeGithubUrl(githubProvider.githubUrl)).host;

const runDetailsUrl = async (workflowRunId: string) =>
	`${await getDokployUrl()}/dashboard/workflows/runs/${workflowRunId}`;

const checkConclusion = (status: WorkflowRunStatus) => {
	switch (status) {
		case "success":
			return "success" as const;
		case "cancelled":
			return "cancelled" as const;
		case "skipped":
			return "skipped" as const;
		default:
			return "failure" as const;
	}
};

const checkRunName = (run: WorkflowRun) =>
	run.targetJob ? `${run.workflowName} / ${run.targetJob}` : run.workflowName;

// Check runs need the Checks write permission, which GitHub Apps created
// before workflows existed don't have until the owner grants it, so reporting
// is best effort and never blocks the run.
const reportCheckRun = async (run: WorkflowRun) => {
	try {
		const repository = await db.query.workflowRepositories.findFirst({
			where: eq(
				workflowRepositories.workflowRepositoryId,
				run.workflowRepositoryId,
			),
		});
		if (!repository) return;
		const octokit = authGithub(await findGithubById(repository.githubId));
		const base = {
			owner: repository.owner,
			repo: repository.repository,
			name: checkRunName(run),
			details_url: await runDetailsUrl(run.workflowRunId),
			external_id: run.workflowRunId,
		};
		const state = FINISHED_STATUSES.includes(run.status)
			? {
					status: "completed" as const,
					conclusion: checkConclusion(run.status),
					completed_at: run.finishedAt ?? new Date().toISOString(),
					output: {
						title: `${run.workflowName} #${run.runNumber}: ${run.status}`,
						summary: run.errorMessage ?? `Run ${run.status} in Dokploy.`,
					},
				}
			: run.status === "running"
				? {
						status: "in_progress" as const,
						started_at: run.startedAt ?? new Date().toISOString(),
					}
				: { status: "queued" as const };

		if (run.checkRunId) {
			await octokit.rest.checks.update({
				...base,
				check_run_id: Number(run.checkRunId),
				...state,
			});
			return;
		}
		const { data } = await octokit.rest.checks.create({
			...base,
			head_sha: run.sha,
			...state,
		});
		await db
			.update(workflowRuns)
			.set({ checkRunId: String(data.id) })
			.where(eq(workflowRuns.workflowRunId, run.workflowRunId));
	} catch (error) {
		console.warn(
			`Could not report the check run for workflow run ${run.workflowRunId}:`,
			(error as Error).message,
		);
	}
};

const nextRunNumber = async (
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	workflowRepositoryId: string,
	workflowPath: string,
) => {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`${workflowRepositoryId}:${workflowPath}`}))`,
	);
	const [row] = await tx
		.select({
			max: sql<number>`cast(coalesce(max(${workflowRuns.runNumber}), 0) as integer)`,
		})
		.from(workflowRuns)
		.where(
			and(
				eq(workflowRuns.workflowRepositoryId, workflowRepositoryId),
				eq(workflowRuns.workflowPath, workflowPath),
			),
		);
	return (row?.max ?? 0) + 1;
};

type NewRun = Omit<
	typeof workflowRuns.$inferInsert,
	"workflowRunId" | "runNumber" | "logPath"
> & { runNumber?: number };

const insertRun = async (values: NewRun) => {
	const run = await db.transaction(async (tx) => {
		const runNumber =
			values.runNumber ??
			(await nextRunNumber(
				tx,
				values.workflowRepositoryId,
				values.workflowPath,
			));
		const [inserted] = await tx
			.insert(workflowRuns)
			.values({ ...values, runNumber })
			.returning();
		if (!inserted) throw new Error("Could not create the workflow run");
		const [withLog] = await tx
			.update(workflowRuns)
			.set({ logPath: workflowRunLogPath(inserted.workflowRunId) })
			.where(eq(workflowRuns.workflowRunId, inserted.workflowRunId))
			.returning();
		return withLog ?? inserted;
	});

	await reportCheckRun(run);
	if (run.status === "queued") {
		void pumpWorkflowRuns();
	}
	return run;
};

type RepositoryRow = typeof workflowRepositories.$inferSelect;

const enqueueMatchingWorkflows = async ({
	repository,
	githubProvider,
	sha,
	matches,
	run,
	skipReason,
}: {
	repository: RepositoryRow;
	githubProvider: Github;
	sha: string;
	matches: (triggers: ReturnType<typeof parseWorkflow>["triggers"]) => boolean;
	run: Omit<
		NewRun,
		| "workflowRepositoryId"
		| "workflowPath"
		| "workflowName"
		| "workflowId"
		| "serverId"
		| "status"
		| "sha"
	>;
	skipReason?: string;
}) => {
	const octokit = authGithub(githubProvider);
	const files = await fetchWorkflowFiles(
		octokit,
		repository.owner,
		repository.repository,
		sha,
		workflowDirectories(repository),
	);
	if (files.length === 0) return 0;

	const known = await db.query.workflows.findMany({
		where: eq(workflows.workflowRepositoryId, repository.workflowRepositoryId),
	});

	let created = 0;
	for (const file of files) {
		const definition = known.find((w) => w.path === file.path);
		if (definition && !definition.enabled) continue;

		let parsed: ReturnType<typeof parseWorkflow>;
		try {
			parsed = parseWorkflow(
				file.content,
				file.path.split("/").pop() ?? file.path,
			);
		} catch {
			continue;
		}
		if (!matches(parsed.triggers)) continue;

		const status: WorkflowRunStatus = skipReason
			? "skipped"
			: repository.serverId
				? "queued"
				: "failure";
		await insertRun({
			...run,
			workflowRepositoryId: repository.workflowRepositoryId,
			workflowPath: file.path,
			workflowName: parsed.name,
			workflowId: definition?.workflowId ?? null,
			serverId: repository.serverId,
			sha,
			status,
			...(status !== "queued"
				? {
						finishedAt: new Date().toISOString(),
						errorMessage:
							skipReason ??
							"No workflow server is configured for this repository.",
					}
				: {}),
		});
		created++;
	}
	return created;
};

const changedFilesFromPush = (payload: any): string[] | undefined => {
	const commits = payload?.commits;
	// Push payloads list at most 20 commits; beyond that the file list is partial.
	if (!Array.isArray(commits) || commits.length === 0 || commits.length >= 20) {
		return undefined;
	}
	return commits.flatMap((commit: any) => [
		...(commit.added ?? []),
		...(commit.modified ?? []),
		...(commit.removed ?? []),
	]);
};

const changedFilesFromPullRequest = async (
	githubProvider: Github,
	owner: string,
	repo: string,
	pullNumber: number,
) => {
	try {
		const octokit = authGithub(githubProvider);
		const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
			owner,
			repo,
			pull_number: pullNumber,
			per_page: 100,
		});
		return files.flatMap((file) =>
			file.previous_filename
				? [file.filename, file.previous_filename]
				: [file.filename],
		);
	} catch {
		return undefined;
	}
};

/**
 * Entry point from the GitHub App webhook. Runs the workflows of every
 * imported repository that matches the event, reading the workflow files at
 * the commit that triggered it, as GitHub Actions does.
 */
export const handleGithubWorkflowEvent = async (
	githubProvider: Github,
	eventName: string,
	payload: any,
) => {
	if (eventName !== "push" && eventName !== "pull_request") return 0;

	const owner =
		payload?.repository?.owner?.login ?? payload?.repository?.owner?.name;
	const repo = payload?.repository?.name;
	if (!owner || !repo) return 0;

	const repositories = await db.query.workflowRepositories.findMany({
		where: and(
			eq(workflowRepositories.githubId, githubProvider.githubId),
			eq(workflowRepositories.owner, owner),
			eq(workflowRepositories.repository, repo),
		),
	});
	if (repositories.length === 0) return 0;

	let created = 0;

	if (eventName === "push") {
		if (payload.deleted || !payload.after || /^0+$/.test(payload.after)) {
			return 0;
		}
		const ref: string = payload.ref;
		const isTag = ref.startsWith("refs/tags/");
		const branch = isTag ? undefined : ref.replace("refs/heads/", "");
		const tag = isTag ? ref.replace("refs/tags/", "") : undefined;
		const message: string = payload.head_commit?.message ?? "";
		const changedFiles = changedFilesFromPush(payload);
		const skip = SKIP_CI_KEYWORDS.some((keyword) => message.includes(keyword));

		for (const repository of repositories) {
			if (branch && branch === repository.defaultBranch) {
				const touchedWorkflows =
					!changedFiles ||
					changedFiles.some(
						(file) =>
							file.startsWith(".dokploy/workflows/") ||
							file.startsWith(".github/workflows/"),
					);
				if (touchedWorkflows) {
					await syncWorkflowDefinitions(repository.workflowRepositoryId).catch(
						() => undefined,
					);
				}
			}
			if (skip) continue;

			const event: WorkflowEvent = { name: "push", branch, tag, changedFiles };
			created += await enqueueMatchingWorkflows({
				repository,
				githubProvider,
				sha: payload.after,
				matches: (triggers) => workflowMatchesEvent(triggers, event),
				run: {
					event: "push",
					ref,
					branch: branch ?? null,
					title: message.split("\n")[0] ?? "",
					actor: payload.sender?.login ?? payload.pusher?.name ?? null,
					payload,
				},
			});
		}
		return created;
	}

	const pullRequest = payload.pull_request;
	const action: string = payload.action;
	if (!pullRequest) return 0;

	const baseBranch: string = pullRequest.base?.ref;
	const fromFork =
		pullRequest.head?.repo?.full_name !== pullRequest.base?.repo?.full_name;

	const changedFiles = await changedFilesFromPullRequest(
		githubProvider,
		owner,
		repo,
		pullRequest.number,
	);
	const event: WorkflowEvent = {
		name: "pull_request",
		action,
		baseBranch,
		changedFiles,
	};

	for (const repository of repositories) {
		created += await enqueueMatchingWorkflows({
			repository,
			githubProvider,
			sha: pullRequest.head.sha,
			matches: (triggers) => workflowMatchesEvent(triggers, event),
			run: {
				event: "pull_request",
				eventAction: action,
				ref: `refs/pull/${pullRequest.number}/merge`,
				branch: pullRequest.head?.ref ?? null,
				title: pullRequest.title ?? "",
				actor: payload.sender?.login ?? null,
				pullRequestNumber: pullRequest.number,
				payload,
			},
			skipReason: fromFork
				? "Pull requests from forks don't run on workflow servers, because their code would get access to the server and the repository secrets."
				: undefined,
		});
	}
	return created;
};

export const dispatchWorkflowRun = async ({
	workflowId,
	branch,
	inputs,
	targetJob,
	actor,
}: {
	workflowId: string;
	branch: string;
	inputs?: Record<string, string>;
	targetJob?: string;
	actor: string;
}) => {
	const workflow = await db.query.workflows.findFirst({
		where: eq(workflows.workflowId, workflowId),
		with: { repository: true },
	});
	if (!workflow) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
	}
	const { repository } = workflow;
	if (!repository.serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select a workflow server in the repository settings first",
		});
	}

	const githubProvider = await findGithubById(repository.githubId);
	const octokit = authGithub(githubProvider);
	const { data: branchInfo } = await octokit.rest.repos.getBranch({
		owner: repository.owner,
		repo: repository.repository,
		branch,
	});
	const sha = branchInfo.commit.sha;
	const ref = `refs/heads/${branch}`;

	const payload = {
		inputs: inputs ?? {},
		ref,
		repository: {
			name: repository.repository,
			full_name: `${repository.owner}/${repository.repository}`,
			owner: { login: repository.owner, name: repository.owner },
			default_branch: repository.defaultBranch,
		},
		sender: { login: actor },
		workflow: workflow.path,
	};

	return await insertRun({
		workflowRepositoryId: repository.workflowRepositoryId,
		workflowId: workflow.workflowId,
		workflowPath: workflow.path,
		workflowName: workflow.name,
		serverId: repository.serverId,
		event: "workflow_dispatch",
		ref,
		branch,
		sha,
		title: targetJob
			? `Job ${targetJob} run manually by ${actor}`
			: `Run manually by ${actor}`,
		actor,
		payload,
		inputs: inputs ?? {},
		targetJob: targetJob ?? null,
		status: "queued",
	});
};

export const rerunWorkflowRun = async (workflowRunId: string) => {
	const previous = await db.query.workflowRuns.findFirst({
		where: eq(workflowRuns.workflowRunId, workflowRunId),
		with: { repository: true },
	});
	if (!previous) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
	}
	if (!FINISHED_STATUSES.includes(previous.status)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Only finished runs can be re-run",
		});
	}
	if (!previous.repository.serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select a workflow server in the repository settings first",
		});
	}

	const [latestAttempt] = await db
		.select({
			attempt: sql<number>`cast(max(${workflowRuns.attempt}) as integer)`,
		})
		.from(workflowRuns)
		.where(
			and(
				eq(workflowRuns.workflowRepositoryId, previous.workflowRepositoryId),
				eq(workflowRuns.workflowPath, previous.workflowPath),
				eq(workflowRuns.runNumber, previous.runNumber),
			),
		);

	return await insertRun({
		workflowRepositoryId: previous.workflowRepositoryId,
		workflowId: previous.workflowId,
		workflowPath: previous.workflowPath,
		workflowName: previous.workflowName,
		serverId: previous.repository.serverId,
		runNumber: previous.runNumber,
		attempt: (latestAttempt?.attempt ?? previous.attempt) + 1,
		event: previous.event,
		eventAction: previous.eventAction,
		ref: previous.ref,
		branch: previous.branch,
		sha: previous.sha,
		title: previous.title,
		actor: previous.actor,
		pullRequestNumber: previous.pullRequestNumber,
		payload: previous.payload,
		inputs: previous.inputs,
		targetJob: previous.targetJob,
		status: "queued",
	});
};

const finishRun = async (
	workflowRunId: string,
	from: WorkflowRunStatus[],
	values: Partial<typeof workflowRuns.$inferInsert> & {
		status: WorkflowRunStatus;
	},
) => {
	const [run] = await db
		.update(workflowRuns)
		.set({ finishedAt: new Date().toISOString(), ...values })
		.where(
			and(
				eq(workflowRuns.workflowRunId, workflowRunId),
				inArray(workflowRuns.status, from),
			),
		)
		.returning();
	if (run) {
		await reportCheckRun(run);
		if (run.serverId && from.includes("running")) {
			await execAsyncRemote(
				run.serverId,
				buildActCleanupScript(workflowRunId),
			).catch(() => undefined);
		}
	}
	return run;
};

export const cancelWorkflowRun = async (workflowRunId: string) => {
	const run = await db.query.workflowRuns.findFirst({
		where: eq(workflowRuns.workflowRunId, workflowRunId),
	});
	if (!run) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
	}
	if (run.status === "queued") {
		await finishRun(workflowRunId, ["queued"], { status: "cancelled" });
		return;
	}
	if (run.status !== "running") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Only queued or running runs can be cancelled",
		});
	}
	await db
		.update(workflowRuns)
		.set({ cancelRequested: true })
		.where(eq(workflowRuns.workflowRunId, workflowRunId));
	if (run.serverId) {
		await execAsyncRemote(run.serverId, buildActCancelScript(workflowRunId));
	}
};

const startRun = async (run: WorkflowRun) => {
	try {
		const repository = await db.query.workflowRepositories.findFirst({
			where: eq(
				workflowRepositories.workflowRepositoryId,
				run.workflowRepositoryId,
			),
		});
		if (!repository || !run.serverId) {
			throw new Error("The repository or its workflow server no longer exists");
		}
		const githubProvider = await findGithubById(repository.githubId);
		// An installation token reaches every repository the GitHub App is
		// installed on; jobs only get one scoped to this repository, like the
		// GITHUB_TOKEN of GitHub Actions.
		const { token } = (await authGithub(githubProvider).auth({
			type: "installation",
			repositoryNames: [repository.repository],
		})) as { token: string };
		const host = githubHost(githubProvider);
		const cloneUrl = `${new URL(normalizeGithubUrl(githubProvider.githubUrl)).origin}/${repository.owner}/${repository.repository}.git`;
		const { secrets, variables } = await loadWorkflowSecrets(
			repository.workflowRepositoryId,
		);

		await execAsyncRemote(
			run.serverId,
			buildActStartScript({
				workflowRunId: run.workflowRunId,
				event: run.event as "push" | "pull_request" | "workflow_dispatch",
				workflowPath: run.workflowPath,
				eventPayload: run.payload,
				secrets,
				variables,
				inputs: run.inputs,
				targetJob: run.targetJob,
				cloneUrl,
				token,
				sha: run.sha,
				ref: run.ref,
				branch: run.event === "pull_request" ? null : run.branch,
				actor: run.actor ?? repository.owner,
				defaultBranch: repository.defaultBranch,
				githubInstance: host === "github.com" ? undefined : host,
			}),
		);
		await reportCheckRun(run);
	} catch (error) {
		await finishRun(run.workflowRunId, ["running"], {
			status: "failure",
			errorMessage: `Could not start the run: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
};

const globalForWorkflows = globalThis as unknown as {
	__dokployWorkflowPumpRunning?: boolean;
	__dokployWorkflowPumpPending?: boolean;
	__dokployWorkflowMonitor?: ReturnType<typeof setInterval>;
};

/**
 * Starts queued runs while their workflow server has free slots, using the
 * server's builds concurrency as the limit. Claiming a run is a conditional
 * update, so several panel instances never start the same run twice.
 */
export const pumpWorkflowRuns = async () => {
	if (globalForWorkflows.__dokployWorkflowPumpRunning) {
		globalForWorkflows.__dokployWorkflowPumpPending = true;
		return;
	}
	globalForWorkflows.__dokployWorkflowPumpRunning = true;
	try {
		do {
			globalForWorkflows.__dokployWorkflowPumpPending = false;
			const queued = await db.query.workflowRuns.findMany({
				where: and(
					eq(workflowRuns.status, "queued"),
					isNotNull(workflowRuns.serverId),
				),
				orderBy: asc(workflowRuns.createdAt),
				limit: 100,
			});
			if (queued.length === 0) break;

			const serverIds = [...new Set(queued.map((r) => r.serverId!))];
			const servers = await db.query.server.findMany({
				where: inArray(server.serverId, serverIds),
				columns: { serverId: true, buildsConcurrency: true },
			});
			const runningCounts = await db
				.select({
					serverId: workflowRuns.serverId,
					count: sql<number>`cast(count(*) as integer)`,
				})
				.from(workflowRuns)
				.where(
					and(
						eq(workflowRuns.status, "running"),
						inArray(workflowRuns.serverId, serverIds),
					),
				)
				.groupBy(workflowRuns.serverId);

			const freeSlots = new Map(
				servers.map((s) => [
					s.serverId,
					Math.max(1, s.buildsConcurrency) -
						(runningCounts.find((c) => c.serverId === s.serverId)?.count ?? 0),
				]),
			);

			const starts: Promise<void>[] = [];
			for (const run of queued) {
				const slots = freeSlots.get(run.serverId!) ?? 0;
				if (slots <= 0) continue;
				const [claimed] = await db
					.update(workflowRuns)
					.set({ status: "running", startedAt: new Date().toISOString() })
					.where(
						and(
							eq(workflowRuns.workflowRunId, run.workflowRunId),
							eq(workflowRuns.status, "queued"),
						),
					)
					.returning();
				if (!claimed) continue;
				freeSlots.set(run.serverId!, slots - 1);
				starts.push(startRun(claimed));
			}
			await Promise.all(starts);
		} while (globalForWorkflows.__dokployWorkflowPumpPending);
	} catch (error) {
		console.error("Error starting workflow runs:", error);
	} finally {
		globalForWorkflows.__dokployWorkflowPumpRunning = false;
	}
};

export const checkRunningWorkflowRuns = async () => {
	const running = await db.query.workflowRuns.findMany({
		where: eq(workflowRuns.status, "running"),
	});
	const byServer = new Map<string, WorkflowRun[]>();
	for (const run of running) {
		if (!run.serverId) {
			await finishRun(run.workflowRunId, ["running"], {
				status: "failure",
				errorMessage: "The workflow server was removed",
			});
			continue;
		}
		byServer.set(run.serverId, [...(byServer.get(run.serverId) ?? []), run]);
	}

	let finishedAny = false;
	for (const [serverId, runs] of byServer) {
		let output: string;
		try {
			const result = await execAsyncRemote(
				serverId,
				buildActStatusScript(runs.map((r) => r.workflowRunId)),
			);
			output = result.stdout;
		} catch {
			continue;
		}

		const states = new Map(
			output
				.split("\n")
				.map((line) => line.trim().split(" "))
				.filter((parts) => parts.length === 2)
				.map(([id, state]) => [id!, state!]),
		);

		for (const run of runs) {
			const state = states.get(run.workflowRunId);
			if (!state) continue;

			if (state === "running") {
				const startedAt = run.startedAt
					? Date.parse(run.startedAt)
					: Date.now();
				if (
					Date.now() - startedAt > MAX_RUN_DURATION_MS &&
					!run.cancelRequested
				) {
					await db
						.update(workflowRuns)
						.set({
							cancelRequested: true,
							errorMessage:
								"The run exceeded the 6 hour limit and was stopped.",
						})
						.where(eq(workflowRuns.workflowRunId, run.workflowRunId));
					await execAsyncRemote(
						serverId,
						buildActCancelScript(run.workflowRunId),
					).catch(() => undefined);
				}
				continue;
			}

			finishedAny = true;
			if (state === "lost") {
				await finishRun(run.workflowRunId, ["running"], {
					status: run.cancelRequested ? "cancelled" : "failure",
					errorMessage: run.cancelRequested
						? run.errorMessage
						: "The run stopped unexpectedly. The workflow server may have restarted.",
				});
				continue;
			}

			const exitCode = Number.parseInt(state, 10);
			await finishRun(run.workflowRunId, ["running"], {
				exitCode: Number.isNaN(exitCode) ? null : exitCode,
				status: run.cancelRequested
					? "cancelled"
					: exitCode === 0
						? "success"
						: "failure",
			});
		}
	}

	if (finishedAny) {
		void pumpWorkflowRuns();
	}
};

export const initWorkflowRunner = () => {
	if (globalForWorkflows.__dokployWorkflowMonitor) return;
	let checking = false;
	globalForWorkflows.__dokployWorkflowMonitor = setInterval(async () => {
		if (checking) return;
		checking = true;
		try {
			await checkRunningWorkflowRuns();
			await pumpWorkflowRuns();
		} catch (error) {
			console.error("Error checking workflow runs:", error);
		} finally {
			checking = false;
		}
	}, MONITOR_INTERVAL_MS);
};

export const findWorkflowRunForOrganization = async (
	workflowRunId: string,
	organizationId: string,
) => {
	const run = await db.query.workflowRuns.findFirst({
		where: eq(workflowRuns.workflowRunId, workflowRunId),
		columns: { payload: false },
		with: {
			repository: {
				columns: {
					workflowRepositoryId: true,
					owner: true,
					repository: true,
					organizationId: true,
					githubId: true,
				},
				with: { github: { columns: { githubUrl: true } } },
			},
			workflow: { columns: { workflowId: true, jobs: true } },
			server: { columns: { serverId: true, name: true } },
		},
	});
	if (!run || run.repository.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
	}
	return run;
};

export const listWorkflowRuns = async ({
	organizationId,
	workflowRepositoryId,
	status,
	search,
	limit,
	offset,
}: {
	organizationId: string;
	workflowRepositoryId?: string;
	status?: WorkflowRunStatus;
	search?: string;
	limit: number;
	offset: number;
}) => {
	const conditions: SQL[] = [
		eq(workflowRepositories.organizationId, organizationId),
	];
	if (workflowRepositoryId) {
		conditions.push(
			eq(workflowRuns.workflowRepositoryId, workflowRepositoryId),
		);
	}
	if (status) conditions.push(eq(workflowRuns.status, status));
	if (search?.trim()) {
		const pattern = `%${search.trim()}%`;
		conditions.push(
			or(
				ilike(workflowRuns.workflowName, pattern),
				ilike(workflowRuns.title, pattern),
				ilike(workflowRuns.branch, pattern),
				ilike(workflowRuns.sha, pattern),
				ilike(workflowRepositories.repository, pattern),
			)!,
		);
	}
	const where = and(...conditions);

	const items = await db
		.select({
			workflowRunId: workflowRuns.workflowRunId,
			runNumber: workflowRuns.runNumber,
			attempt: workflowRuns.attempt,
			workflowName: workflowRuns.workflowName,
			workflowPath: workflowRuns.workflowPath,
			event: workflowRuns.event,
			eventAction: workflowRuns.eventAction,
			branch: workflowRuns.branch,
			sha: workflowRuns.sha,
			title: workflowRuns.title,
			actor: workflowRuns.actor,
			status: workflowRuns.status,
			createdAt: workflowRuns.createdAt,
			startedAt: workflowRuns.startedAt,
			finishedAt: workflowRuns.finishedAt,
			workflowRepositoryId: workflowRuns.workflowRepositoryId,
			owner: workflowRepositories.owner,
			repository: workflowRepositories.repository,
		})
		.from(workflowRuns)
		.innerJoin(
			workflowRepositories,
			eq(
				workflowRuns.workflowRepositoryId,
				workflowRepositories.workflowRepositoryId,
			),
		)
		.where(where)
		.orderBy(desc(workflowRuns.createdAt))
		.limit(limit)
		.offset(offset);

	const [total] = await db
		.select({ count: sql<number>`cast(count(*) as integer)` })
		.from(workflowRuns)
		.innerJoin(
			workflowRepositories,
			eq(
				workflowRuns.workflowRepositoryId,
				workflowRepositories.workflowRepositoryId,
			),
		)
		.where(where);

	return { items, total: total?.count ?? 0 };
};
