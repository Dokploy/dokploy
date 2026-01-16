import type { ApplicationNested } from "../utils/builders";
import { getDokployUrl } from "./admin";
import * as github from "./github";

export type CheckStatus = "queued" | "in_progress" | "success" | "failure";

export async function setStatusCheck(
	application: ApplicationNested,
	head_sha: string,
	status: CheckStatus,
) {
	// @TODO: check for preview deployment and update link
	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/environment/${application.environmentId}/services/application/${application.applicationId}?tab=deployments`;

	try {
		switch (application.sourceType) {
			case "github":
				return await github.setStatusCheck({
					owner: application.owner!,
					repository: application.repository!,
					githubId: application.githubId!,
					head_sha,
					name: `Dokploy (${application.environment.project.name}/${application.name})`,
					status,
					details_url: buildLink,
				});
		}
	} catch (error) {
		console.error(
			`❌ Failed to write status check to "${application.sourceType}"`,
			error,
		);
	}
}
