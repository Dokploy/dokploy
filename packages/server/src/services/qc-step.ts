import { db } from "@dokploy/server/db";
import { deployments } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import type { Application } from "./application";
import { updateApplication } from "./application";
import { runTestPlanGenerate, runTestPlanUpdate } from "./qc-agent-client";

export interface QcStepResult {
	verdict: "skipped" | "ready" | "error";
	testPlanVersion: number | null;
}

// Blocking QC step: generates (first deploy) or updates (redeploy) the
// application's test-plan document via QC_Agent_Tool before the build runs.
export const runQcStep = async (
	application: Application,
): Promise<QcStepResult> => {
	if (!application.qcEnabled || !application.qcProjectId) {
		return { verdict: "skipped", testPlanVersion: application.testPlanVersion };
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
			? await runTestPlanGenerate({ qcProjectId: application.qcProjectId })
			: await runTestPlanUpdate({ qcProjectId: application.qcProjectId });

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
