import type { Application } from "./application";
import {
	claimTestPlanGeneration,
	findApplicationById,
	updateApplication,
} from "./application";
import {
	createQcRun,
	getQcPlanMarkdown,
	QC_SERVICE_TIMEOUT_MS,
	type QcStageView,
	waitForQcRun,
} from "./qc-service-client";
import { recordTestPlanVersion } from "./test-plan-history";

export interface QcStepResult {
	verdict: "skipped" | "ready" | "error";
	testPlanVersion: number | null;
	reason?: string;
	runId?: string;
	stages?: QcStageView[];
	// The service generated tests and is waiting for the deploy to run them.
	awaitingExec?: boolean;
}

// A "generating" row older than this was left behind by a crashed run.
export const QC_STALE_AFTER_MS = QC_SERVICE_TIMEOUT_MS + 60_000;
const WAIT_POLL_INTERVAL_MS = 3000;

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

// github/git are the only sourceTypes with a repo URL dokploy can build
// without an extra lookup (gitlab/gitea/bitbucket need their provider
// row's own self-hosted base URL, not wired up yet; docker/drop have no
// git source at all) — skip cleanly for the rest rather than guess a URL.
export const getQcRepoSource = (
	application: Application,
): { repoUrl: string; branch: string } | null => {
	if (application.sourceType === "github") {
		return application.owner && application.repository && application.branch
			? {
					repoUrl: `https://github.com/${application.owner}/${application.repository}.git`,
					branch: application.branch,
				}
			: null;
	}
	if (application.sourceType === "git") {
		return application.customGitUrl && application.customGitBranch
			? {
					repoUrl: application.customGitUrl,
					branch: application.customGitBranch,
				}
			: null;
	}
	return null;
};

export const isTestPlanGenerating = (
	application: Pick<Application, "testPlanStatus" | "testPlanStartedAt">,
) =>
	application.testPlanStatus === "generating" &&
	!!application.testPlanStartedAt &&
	Date.now() - Date.parse(application.testPlanStartedAt) < QC_STALE_AFTER_MS;

export interface RunQcStepOptions {
	// The commit the plan is for: the one just cloned for a deploy, or the
	// one already deployed for a manual regenerate.
	commitSha?: string;
	// Idempotency-Key of the service run; retrying the same deployment
	// returns the run it already started.
	idempotencyKey?: string;
	// Re-plan even if this commit already has a plan (manual regenerate).
	force?: boolean;
	// Also have tests generated and judged, which makes the run wait for the
	// deploy to execute them (see qc-exec.ts).
	generateTests?: boolean;
	// The manual regenerate path reports failures through testPlanStatus
	// instead of aborting anything, so it opts out of the "closed" policy.
	ignoreFailurePolicy?: boolean;
}

// Another run already holds the claim for this application: wait for it
// instead of starting a duplicate, then report its outcome under the same
// failure policy as if this call had produced it.
const waitForRunningTestPlan = async (
	application: Application,
	shouldThrow: boolean,
): Promise<QcStepResult> => {
	const deadline = Date.now() + QC_SERVICE_TIMEOUT_MS;
	let latest = await findApplicationById(application.applicationId);

	while (latest.testPlanStatus === "generating" && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
		latest = await findApplicationById(application.applicationId);
	}

	if (latest.testPlanStatus === "ready") {
		return { verdict: "ready", testPlanVersion: latest.testPlanVersion };
	}

	const reason =
		latest.testPlanStatus === "generating"
			? "Timed out waiting for a test plan that is already being generated"
			: (latest.testPlanError ?? "The concurrent test plan run did not finish");
	if (shouldThrow) {
		throw new Error(reason);
	}
	return { verdict: "error", testPlanVersion: latest.testPlanVersion, reason };
};

// Blocking QC step: asks the QC service for a test plan of the commit that
// was just cloned (it re-plans from the diff on a redeploy), before the
// build runs.
export const runQcStep = async (
	initial: Application,
	options: RunQcStepOptions = {},
): Promise<QcStepResult> => {
	// The caller's copy can be minutes old (a deploy loads it before queueing),
	// so settings changed in the meantime must win.
	const application = await findApplicationById(initial.applicationId);
	const shouldThrow =
		application.qcFailurePolicy === "closed" && !options.ignoreFailurePolicy;

	if (!application.qcEnabled) {
		return {
			verdict: "skipped",
			testPlanVersion: application.testPlanVersion,
			reason: "QC test-plan step is disabled for this application",
		};
	}

	const source = getQcRepoSource(application);
	if (!source) {
		console.log(
			`QC step skipped for application ${application.applicationId}: no resolvable git repo for sourceType "${application.sourceType}"`,
		);
		return {
			verdict: "skipped",
			testPlanVersion: application.testPlanVersion,
			reason: `No resolvable git repo URL for source type "${application.sourceType}"`,
		};
	}
	if (!options.commitSha) {
		return {
			verdict: "skipped",
			testPlanVersion: application.testPlanVersion,
			reason: "No commit to plan for yet; deploy the application first",
		};
	}

	const claimed = await claimTestPlanGeneration(
		application.applicationId,
		QC_STALE_AFTER_MS,
	);
	if (!claimed) {
		return waitForRunningTestPlan(application, shouldThrow);
	}

	try {
		const created = await createQcRun({
			repoUrl: source.repoUrl,
			branch: source.branch,
			commitSha: options.commitSha,
			name: application.name,
			force: options.force,
			stages: options.generateTests
				? ["plan", "generate", "triage"]
				: undefined,
			idempotencyKey:
				options.idempotencyKey ??
				`plan-${application.applicationId}-${options.commitSha}-${Date.now()}`,
		});
		const run = await waitForQcRun(created.runId, {
			untilAwaitingExec: options.generateTests,
		});

		if (run.status !== "done" && run.status !== "awaiting_exec") {
			const reason =
				run.error?.message ?? `The QC run ended as "${run.status}"`;
			await updateApplication(application.applicationId, {
				testPlanStatus: "error",
				testPlanError: reason,
			});
			return {
				verdict: "error",
				testPlanVersion: application.testPlanVersion,
				reason,
				runId: run.runId,
				stages: run.stages,
			};
		}

		const content = await getQcPlanMarkdown(run.runId);
		const version = run.planVersion ?? application.testPlanVersion;
		await updateApplication(application.applicationId, {
			testPlanContent: content,
			testPlanVersion: version,
			testPlanStatus: "ready",
			testPlanError: null,
		});
		await recordTestPlanVersion({
			applicationId: application.applicationId,
			branch: source.branch,
			version,
			content,
			commitSha: options.commitSha,
			qcRunId: run.runId,
		});
		return {
			verdict: "ready",
			testPlanVersion: version,
			runId: run.runId,
			stages: run.stages,
			awaitingExec: run.status === "awaiting_exec",
		};
	} catch (error) {
		console.log("QC step failed", error);
		await updateApplication(application.applicationId, {
			testPlanStatus: "error",
			testPlanError: errorMessage(error),
		});

		if (shouldThrow) {
			throw error;
		}
		return {
			verdict: "error",
			testPlanVersion: application.testPlanVersion,
			reason: errorMessage(error),
		};
	}
};

// Fire-and-forget entry point for the manual "Regenerate" button: the HTTP
// request returns immediately and the UI follows testPlanStatus, so a run
// that outlives a proxy timeout can't be mistaken for a failure.
export const regenerateTestPlanInBackground = (
	application: Application,
	commitSha: string,
) => {
	const { applicationId } = application;
	void runQcStep(application, {
		commitSha,
		force: true,
		ignoreFailurePolicy: true,
	})
		.then(async (result) => {
			if (result.verdict === "skipped") {
				await updateApplication(applicationId, {
					testPlanError: result.reason ?? null,
				});
			}
		})
		.catch(async (error) => {
			console.log("Background test plan regeneration failed", error);
			await updateApplication(applicationId, {
				testPlanStatus: "error",
				testPlanError: errorMessage(error),
			}).catch(() => {});
		});
};
