import {
	cancelQcRun,
	getQcManifest,
	getQcTestBundle,
	postQcExecResult,
	type QcStageView,
	waitForQcRun,
} from "@dokploy/server/services/qc-service-client";
import {
	getRunnerImage,
	runGeneratedTests,
} from "@dokploy/server/utils/builders/run-generated-tests";
import type { Application } from "./application";
import type { QcStepResult } from "./qc-step";

export interface TestExecFailureDetail {
	name: string;
	category: string;
	reason?: string;
	suggestedFix?: string;
}

export interface TestExecSummary {
	source: "command" | "generated";
	verdict?: string;
	headline?: string;
	passed?: number | null;
	failed?: number | null;
	skipped?: number | null;
	failures?: string[];
	// What the service's triage made of the failures: code_bug, test_bug,
	// flaky, env or unclassified.
	categories?: Record<string, number>;
	details?: TestExecFailureDetail[];
}

export interface GeneratedTestsOutcome {
	status: "passed" | "failed" | "skipped";
	exitCode: number | null;
	summary: TestExecSummary;
	// The service run's stages once it has judged the results.
	stages?: QcStageView[];
	// Set when the failure policy says the deploy must stop here.
	blockDeploy?: Error;
}

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

// Runs the tests the QC service generated for this deployment's commit in a
// container on the build server, reports the outcome back to the service and
// returns what the deployment should record. It never throws: a failure to run
// the tests is an outcome like any other, decided by `testExecFailurePolicy`.
export const runQcGeneratedTests = async (params: {
	application: Pick<
		Application,
		"appName" | "testRunnerImage" | "testExecFailurePolicy"
	>;
	qcResult: QcStepResult;
	deploymentId: string;
	serverId?: string | null;
	log: (message: string) => Promise<void>;
}): Promise<GeneratedTestsOutcome> => {
	const { application, qcResult, deploymentId, serverId, log } = params;
	const blocks = application.testExecFailurePolicy === "closed";

	if (!qcResult.awaitingExec || !qcResult.runId) {
		const reason =
			qcResult.verdict === "ready"
				? "the QC service had no tests to generate for this commit"
				: (qcResult.reason ?? "the QC step did not produce tests");
		await log(`== QC generated tests skipped: ${reason} ==`);
		return {
			status: "skipped",
			exitCode: null,
			summary: { source: "generated", verdict: "skipped", headline: reason },
		};
	}

	const runId = qcResult.runId;
	let reported = false;
	try {
		const manifest = await getQcManifest(runId);
		const bundle = await getQcTestBundle(runId);
		await log(
			`== QC generated tests: running ${manifest.files.length} file(s) for ${manifest.scenarios.length} scenario(s) in ${getRunnerImage(manifest, application.testRunnerImage)} ==`,
		);

		const result = await runGeneratedTests({
			deploymentId,
			serverId,
			appName: application.appName,
			bundle,
			manifest,
			runnerImage: application.testRunnerImage,
		});
		await postQcExecResult(runId, result);
		reported = true;

		const run = await waitForQcRun(runId);
		const triage = run.stages.find((stage) => stage.stage === "triage");
		const output = (triage?.output ?? {}) as Record<string, unknown>;
		const verdict = run.verdict ?? (output.verdict as string | undefined);
		const headline =
			(output.headline as string | undefined) ??
			run.error?.message ??
			`exit code ${result.exitCode}`;

		const summary: TestExecSummary = {
			source: "generated",
			verdict: verdict ?? "unknown",
			headline,
			passed: (output.passed as number | null | undefined) ?? null,
			failed: (output.failed as number | null | undefined) ?? null,
			skipped: (output.skipped as number | null | undefined) ?? null,
			failures: (output.failures as string[] | undefined) ?? [],
			categories: output.categories as Record<string, number> | undefined,
			details: output.details as TestExecFailureDetail[] | undefined,
		};
		// "fail": the service found an application bug (or couldn't place a
		// failure); this is what the failure policy is about.
		const failed = verdict === "fail" || run.status !== "done";
		// "warn" with failing tests: they failed, but none was judged an
		// application bug, so they are reported and never block the deploy.
		const warned = !failed && verdict === "warn" && (summary.failed ?? 0) > 0;
		await log(
			`== QC generated tests ${failed ? "FAILED" : warned ? "WARNING" : "ok"}: ${headline} ==`,
		);

		return {
			status:
				failed || warned ? "failed" : verdict === "warn" ? "skipped" : "passed",
			exitCode: result.exitCode,
			summary,
			stages: run.stages,
			blockDeploy:
				failed && blocks
					? new Error(`Generated tests failed: ${headline}`)
					: undefined,
		};
	} catch (error) {
		const message = errorMessage(error);
		await log(`== QC generated tests could not be run: ${message} ==`).catch(
			() => {},
		);
		return {
			status: "skipped",
			exitCode: null,
			summary: { source: "generated", verdict: "error", headline: message },
			blockDeploy: blocks
				? new Error(`Generated tests could not be run: ${message}`)
				: undefined,
		};
	} finally {
		if (!reported) {
			// The deploy is moving on without reporting, so the service run must not
			// keep waiting (and holding this branch) for results that won't come.
			await cancelQcRun(runId).catch(() => {});
		}
	}
};
