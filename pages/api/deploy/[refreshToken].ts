import { updateApplicationStatus } from "@/server/api/services/application";
import { db } from "@/server/db";
import { applications } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/application-queue";
import { myApplicationQueue } from "@/server/queues/queueSetup";
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

		if (sourceType === "docker") {
			const applicationDockerTag = extractImageTag(application.dockerImage);
			const webhookDockerTag = extractImageTagFromRequest(
				req.headers,
				req.body,
			);
			if (
				applicationDockerTag &&
				webhookDockerTag &&
				webhookDockerTag !== applicationDockerTag
			) {
				res.status(301).json({
					message: `Application Image Tag (${applicationDockerTag}) doesn't match request event payload Image Tag (${webhookDockerTag}).`,
				});
				return;
			}
		} else if (sourceType === "github") {
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
			await myApplicationQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
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

/**
 * Return the last part of the image name, which is the tag
 * Example: "my-image" => null
 * Example: "my-image:latest" => "latest"
 * Example: "my-image:1.0.0" => "1.0.0"
 * Example: "myregistryhost:5000/fedora/httpd:version1.0" => "version1.0"
 * @link https://docs.docker.com/reference/cli/docker/image/tag/
 */
function extractImageTag(dockerImage: string | null) {
	if (!dockerImage || typeof dockerImage !== "string") {
		return null;
	}

	const tag = dockerImage.split(":").pop();
	return tag === dockerImage ? "latest" : tag;
}

/**
 * @link https://docs.docker.com/docker-hub/webhooks/#example-webhook-payload
 */
function extractImageTagFromRequest(headers: any, body: any): string | null {
	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.push_data && body.repository) {
			return body.push_data.tag;
		}
	}
	return null;
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
