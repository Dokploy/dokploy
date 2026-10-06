import { db } from "@dokploy/server/db";
import { testPlanHistory } from "@dokploy/server/db/schema";
import { and, desc, eq, notInArray } from "drizzle-orm";

// Plans are tens of KB each; this keeps the newest ones and drops the rest.
export const MAX_PLAN_VERSIONS_KEPT = 100;

// Remembers a plan version. Seeing the same version again (a redeploy of the
// same commit, a plan carried forward) changes nothing. A failure here must
// never fail the deploy that produced the plan, so it is only logged.
export const recordTestPlanVersion = async (params: {
	applicationId: string;
	branch: string;
	version: number;
	content: string;
	commitSha?: string | null;
	qcRunId?: string | null;
}) => {
	try {
		await db
			.insert(testPlanHistory)
			.values({
				applicationId: params.applicationId,
				branch: params.branch,
				version: params.version,
				content: params.content,
				commitSha: params.commitSha ?? null,
				qcRunId: params.qcRunId ?? null,
			})
			.onConflictDoNothing();

		const keep = await db
			.select({ id: testPlanHistory.testPlanHistoryId })
			.from(testPlanHistory)
			.where(eq(testPlanHistory.applicationId, params.applicationId))
			.orderBy(desc(testPlanHistory.createdAt))
			.limit(MAX_PLAN_VERSIONS_KEPT);
		if (keep.length === MAX_PLAN_VERSIONS_KEPT) {
			await db.delete(testPlanHistory).where(
				and(
					eq(testPlanHistory.applicationId, params.applicationId),
					notInArray(
						testPlanHistory.testPlanHistoryId,
						keep.map((row) => row.id),
					),
				),
			);
		}
	} catch (error) {
		console.log("Could not record the test plan version", error);
	}
};

// Newest first, without the content (a plan is large and the list is shown often).
export const listTestPlanHistory = async (applicationId: string) =>
	await db
		.select({
			testPlanHistoryId: testPlanHistory.testPlanHistoryId,
			branch: testPlanHistory.branch,
			version: testPlanHistory.version,
			commitSha: testPlanHistory.commitSha,
			qcRunId: testPlanHistory.qcRunId,
			createdAt: testPlanHistory.createdAt,
		})
		.from(testPlanHistory)
		.where(eq(testPlanHistory.applicationId, applicationId))
		.orderBy(desc(testPlanHistory.createdAt));

export const findTestPlanHistoryEntry = async (
	applicationId: string,
	testPlanHistoryId: string,
) => {
	const [entry] = await db
		.select()
		.from(testPlanHistory)
		.where(
			and(
				eq(testPlanHistory.applicationId, applicationId),
				eq(testPlanHistory.testPlanHistoryId, testPlanHistoryId),
			),
		)
		.limit(1);
	return entry ?? null;
};
