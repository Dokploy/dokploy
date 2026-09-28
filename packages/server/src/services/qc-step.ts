import { db } from "@dokploy/server/db";
import { deployments } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import type { Application } from "./application";
import { updateApplication } from "./application";
import {
	resolveQcProject,
	runTestPlanGenerate,
	runTestPlanUpdate,
} from "./qc-agent-client";

export interface QcStepResult {
	verdict: "skipped" | "ready" | "error";
	testPlanVersion: number | null;
}

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

// Blocking QC step: generates (first deploy) or updates (redeploy) the
// application's test-plan document via QC_Agent_Tool before the build runs.
export const runQcStep = async (
	application: Application,
): Promise<QcStepResult> => {
	if (!application.qcEnabled) {
		return { verdict: "skipped", testPlanVersion: application.testPlanVersion };
	}

	let qcProjectId = application.qcProjectId;
	if (!qcProjectId) {
		const repoUrl = getApplicationRepoUrl(application);
		if (!repoUrl) {
			console.log(
				`QC step skipped for application ${application.applicationId}: no resolvable git repo URL for sourceType "${application.sourceType}"`,
			);
			return {
				verdict: "skipped",
				testPlanVersion: application.testPlanVersion,
			};
		}
		try {
			qcProjectId = await resolveQcProject({
				repoUrl,
				name: application.name,
			});
			await updateApplication(application.applicationId, { qcProjectId });
		} catch (error) {
			console.log("QC step: failed to resolve QC_Agent_Tool project", error);
			if (application.qcFailurePolicy === "closed") {
				throw error;
			}
			return { verdict: "error", testPlanVersion: application.testPlanVersion };
		}
	}

	const priorDeployment = await db.query.deployments.findFirst({
		where: eq(deployments.applicationId, application.applicationId),
	});
	const isFirstDeploy = !priorDeployment;

	try {
		await updateApplication(application.applicationId, {
			testPlanStatus: "generating",
		});

		const result = isFirstDeploy
			? await runTestPlanGenerate({ qcProjectId })
			: await runTestPlanUpdate({ qcProjectId });

		if (result.status === "error") {
			await updateApplication(application.applicationId, {
				testPlanStatus: "error",
			});
			return { verdict: "error", testPlanVersion: application.testPlanVersion };
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
		return { verdict: "error", testPlanVersion: application.testPlanVersion };
	}
};
