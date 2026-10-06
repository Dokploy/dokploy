import type { Application } from "./application";
import { findApplicationById, updateApplication } from "./application";
import {
	resolveQcProject,
	runTestPlanGenerate,
	runTestPlanUpdate,
} from "./qc-agent-client";

export interface QcStepResult {
	verdict: "skipped" | "ready" | "error";
	testPlanVersion: number | null;
	reason?: string;
}

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
export const runQcStep = (application: Application): Promise<QcStepResult> =>
	withApplicationLock(application.applicationId, () =>
		runQcStepUnlocked(application),
	);

const runQcStepUnlocked = async (
	staleApplication: Application,
): Promise<QcStepResult> => {
	// Re-read from DB now that it's actually our turn — a deploy that
	// waited on the lock is still holding whatever snapshot its caller
	// fetched before queueing, which may be stale by the time the prior
	// deploy's QC step (e.g. qcProjectId, testPlanVersion) has finished
	// writing its own updates.
	const application = await findApplicationById(staleApplication.applicationId);
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
		if (application.qcFailurePolicy === "closed") {
			throw error;
		}
		return {
			verdict: "error",
			testPlanVersion: application.testPlanVersion,
			reason: errorMessage(error),
		};
	}

	// The deployment row of the deploy that triggers this step already exists
	// by now, so "has any deployment" can't tell a first deploy apart.
	const isFirstDeploy = application.testPlanVersion === 0;

	try {
		await updateApplication(application.applicationId, {
			testPlanStatus: "generating",
		});

		const result = isFirstDeploy
			? await runTestPlanGenerate({ qcProjectId, branch })
			: await runTestPlanUpdate({ qcProjectId, branch });

		if (result.status === "error") {
			await updateApplication(application.applicationId, {
				testPlanStatus: "error",
			});
			return {
				verdict: "error",
				testPlanVersion: application.testPlanVersion,
				reason: "QC Agent reported an error while building the test plan",
			};
		}

		await updateApplication(application.applicationId, {
			testPlanContent: result.content,
			testPlanVersion: result.version,
			testPlanStatus: "ready",
		});
		return { verdict: "ready", testPlanVersion: result.version };
	} catch (error) {
		console.log("QC step failed", error);
		await updateApplication(application.applicationId, {
			testPlanStatus: "error",
		});

		if (application.qcFailurePolicy === "closed") {
			throw error;
		}
		return {
			verdict: "error",
			testPlanVersion: application.testPlanVersion,
			reason: errorMessage(error),
		};
	}
};
