import { updateApplicationStatus } from "@/server/api/services/application";
import { db } from "@/server/db";
import { applications } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/deployments-queue";
// import { myQueue } from "@/server/queues/queueSetup";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { refreshToken } = req.query;
	try {
		if (req.headers["x-github-event"] === "ping") {
			res.status(200).json({ message: "Ping received, webhook is active" });
			return;
		}
		const application = await db.query.applications.findFirst({
			where: eq(applications.refreshToken, refreshToken as string),
			with: {
				project: true,
			},
		});

		if (!application) {
			res.status(404).json({ message: "Application Not Found" });
			return;
		}
		if (!application?.autoDeploy) {
			res.status(400).json({ message: "Application Not Deployable" });
			return;
		}

		const deploymentTitle = extractCommitMessage(req.headers, req.body);

		const sourceType = application.sourceType;
		if (sourceType === "github") {
			const branchName = extractBranchName(req.headers, req.body);
			if (!branchName || branchName !== application.branch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		} else if (sourceType === "git") {
			const branchName = extractBranchName(req.headers, req.body);
			if (!branchName || branchName !== application.customGitBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		}

		try {
			await updateApplicationStatus(
				application.applicationId as string,
				"running",
			);

			const jobData: DeploymentJob = {
				applicationId: application.applicationId as string,
				titleLog: deploymentTitle,
				type: "deploy",
			};
			// await myQueue.add(
			// 	"deployments",
			// 	{ ...jobData },
			// 	{
			// 		removeOnComplete: true,
			// 		removeOnFail: true,
			// 	},
			// );
		} catch (error) {
			res.status(400).json({ message: "Error To Deploy Application", error });
			return;
		}

		res.status(200).json({ message: "App Deployed Succesfully" });
	} catch (error) {
		console.log(error);
		res.status(400).json({ message: "Error To Deploy Application", error });
	}
}
function extractCommitMessage(headers: any, body: any) {
	// GitHub
	if (headers["x-github-event"]) {
		return body.head_commit ? body.head_commit.message : "NEW COMMIT";
	}

	// GitLab
	if (headers["x-gitlab-event"]) {
		return body.commits && body.commits.length > 0
			? body.commits[0].message
			: "NEW COMMIT";
	}

	// Bitbucket
	if (headers["x-event-key"]?.includes("repo:push")) {
		return body.push.changes && body.push.changes.length > 0
			? body.push.changes[0].new.target.message
			: "NEW COMMIT";
	}

	// Gitea
	if (headers["x-gitea-event"]) {
		return body.commits && body.commits.length > 0
			? body.commits[0].message
			: "NEW COMMIT";
	}

	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.push_data && body.repository) {
			return `Docker image pushed: ${body.repository.repo_name}:${body.push_data.tag} by ${body.push_data.pusher}`;
		}
	}

	return "NEW CHANGES";
}

function extractBranchName(headers: any, body: any) {
	if (headers["x-github-event"] || headers["x-gitea-event"]) {
		return body?.ref?.replace("refs/heads/", "");
	}

	if (headers["x-gitlab-event"]) {
		return body?.ref ? body?.ref.replace("refs/heads/", "") : null;
	}

	if (headers["x-event-key"]?.includes("repo:push")) {
		return body?.push?.changes[0]?.new?.name;
	}

	return null;
}
