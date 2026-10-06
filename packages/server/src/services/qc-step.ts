import type { Application } from "./application";
import {
	claimTestPlanGeneration,
	findApplicationById,
	updateApplication,
} from "./application";
import {
	QC_AGENT_TIMEOUT_MS,
	resolveQcProject,
	runTestPlanGenerate,
	runTestPlanUpdate,
} from "./qc-agent-client";

export interface QcStepResult {
	verdict: "skipped" | "ready" | "error";
	testPlanVersion: number | null;
	reason?: string;
}

// A "generating" row older than this was left behind by a crashed run:
// project resolution plus the run itself can each use the full timeout.
export const QC_STALE_AFTER_MS = 2 * QC_AGENT_TIMEOUT_MS + 60_000;
const WAIT_POLL_INTERVAL_MS = 3000;

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

// github/git are the only sourceTypes with a repo URL dokploy can build
// without an extra lookup (gitlab/gitea/bitbucket need their provider
// row's own self-hosted base URL, not wired up yet; docker/drop have no
// git source at all) — skip cleanly for the rest rather than guess a URL.
const getApplicationRepoUrl = (application: Application): string | null => {
	if (application.sourceType === "github") {
		return application.owner && application.repository
			? `https://github.com/${application.owner}/${application.repository}.git`
			: null;
	}
	if (application.sourceType === "git") {
		return application.customGitUrl ?? null;
	}
	return null;
};

const getApplicationBranch = (application: Application): string | null => {
	if (application.sourceType === "github") {
		return application.branch ?? null;
	}
	if (application.sourceType === "git") {
		return application.customGitBranch ?? null;
	}
	return null;
};

export const isTestPlanGenerating = (
	application: Pick<Application, "testPlanStatus" | "testPlanStartedAt">,
) =>
	application.testPlanStatus === "generating" &&
	!!application.testPlanStartedAt &&
	Date.now() - Date.parse(application.testPlanStartedAt) < QC_STALE_AFTER_MS;

interface RunQcStepOptions {
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
	const deadline = Date.now() + QC_AGENT_TIMEOUT_MS;
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

// Keyed by applicationId — a second deploy of the SAME app queued while
// the first's QC step is still running waits for it instead of racing it
// (dokploy's own deploy queue has no per-application concurrency limit,
// only a per-server one, so two overlapping deploys of one app is a real,
// reachable case: a double-click on "Deploy", or two webhook pushes
// landing close together). Deploys of DIFFERENT applications never wait on
// each other — this map has one entry per app, not a single global lock.
const inFlight = new Map<string, Promise<unknown>>();

const withApplicationLock = <T>(
	applicationId: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const prior = inFlight.get(applicationId) ?? Promise.resolve();
	const run = prior.then(fn, fn);
	// Stored value must never reject — an unhandled rejection here would
	// otherwise surface later, on some unrelated deploy that merely
	// happened to queue up behind this one and never even inspects its
	// result.
	inFlight.set(
		applicationId,
		run.catch(() => undefined),
	);
	return run;
};

// Blocking QC step: generates (first deploy) or updates (redeploy) the
// application's test-plan document via QC_Agent_Tool before the build runs.
export const runQcStep = (
	application: Application,
	options: RunQcStepOptions = {},
): Promise<QcStepResult> =>
	withApplicationLock(application.applicationId, () =>
		runQcStepUnlocked(application, options),
	);

const runQcStepUnlocked = async (
	initial: Application,
	options: RunQcStepOptions,
): Promise<QcStepResult> => {
	// Re-read now that it's our turn: the caller's copy can be minutes old (a
	// deploy loads it before queueing) and a run ahead of us may have changed
	// qcProjectId or testPlanVersion, so current settings must win.
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

	const repoUrl = getApplicationRepoUrl(application);
	const branch = getApplicationBranch(application);
	if (!repoUrl || !branch) {
		console.log(
			`QC step skipped for application ${application.applicationId}: no resolvable git repo URL/branch for sourceType "${application.sourceType}"`,
		);
		return {
			verdict: "skipped",
			testPlanVersion: application.testPlanVersion,
			reason: `No resolvable git repo URL/branch for source type "${application.sourceType}"`,
		};
	}

	// Resolved on every run, not just once — QC_Agent_Tool get-or-creates
	// per (repoUrl, branch) and returns immediately once that branch's own
	// clone is ready, so this stays cheap after the first deploy. Doing it
	// every time (rather than skipping once `qcProjectId` is cached) is
	// what makes this correctly notice if the application's own branch
	// setting ever changes, instead of silently generating test-plans
	// against whatever branch happened to be configured the first time.
	let qcProjectId: string;
	try {
		qcProjectId = await resolveQcProject({
			repoUrl,
			branch,
			name: application.name,
		});
		if (qcProjectId !== application.qcProjectId) {
			await updateApplication(application.applicationId, { qcProjectId });
		}
	} catch (error) {
		console.log("QC step: failed to resolve QC_Agent_Tool project", error);
		// Status is left alone: another run may hold the "generating" claim.
		await updateApplication(application.applicationId, {
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

	const claimed = await claimTestPlanGeneration(
		application.applicationId,
		QC_STALE_AFTER_MS,
	);
	if (!claimed) {
		return waitForRunningTestPlan(application, shouldThrow);
	}

	// The deployment row of the deploy that triggers this step already exists
	// by now, so "has any deployment" can't tell a first deploy apart.
	const isFirstDeploy = application.testPlanVersion === 0;

	try {
		const result = isFirstDeploy
			? await runTestPlanGenerate({ qcProjectId, branch })
			: await runTestPlanUpdate({ qcProjectId, branch });

		if (result.status === "error") {
			const reason = "QC Agent reported an error while building the test plan";
			await updateApplication(application.applicationId, {
				testPlanStatus: "error",
				testPlanError: reason,
			});
			return {
				verdict: "error",
				testPlanVersion: application.testPlanVersion,
				reason,
			};
		}

		await updateApplication(application.applicationId, {
			testPlanContent: result.content,
			testPlanVersion: result.version,
			testPlanStatus: "ready",
			testPlanError: null,
		});
		return { verdict: "ready", testPlanVersion: result.version };
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
export const regenerateTestPlanInBackground = (application: Application) => {
	const { applicationId } = application;
	void runQcStep(application, { ignoreFailurePolicy: true })
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
