import { IS_CLOUD, shouldDeploy } from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server/db";
import { applications } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";

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
				bitbucket: true,
			},
		});

		if (!application) {
			res.status(404).json({ message: "Application Not Found" });
			return;
		}
		if (!application?.autoDeploy) {
			res.status(400).json({
				message: "Automatic deployments are disabled for this application",
			});
			return;
		}

		const deploymentTitle = extractCommitMessage(req.headers, req.body);
		const deploymentHash = extractHash(req.headers, req.body);

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
			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

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

			const provider = getProviderByHeader(req.headers);
			let normalizedCommits: string[] = [];

			if (provider === "github") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			} else if (provider === "gitlab") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			} else if (provider === "gitea") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			}

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
		} else if (sourceType === "gitlab") {
			const branchName = extractBranchName(req.headers, req.body);

			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			if (!branchName || branchName !== application.gitlabBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		} else if (sourceType === "bitbucket") {
			const branchName = extractBranchName(req.headers, req.body);

			if (!branchName || branchName !== application.bitbucketBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}

			const commitedPaths = await extractCommitedPaths(
				req.body,
				application.bitbucketOwner,
				application.bitbucket?.appPassword || "",
				application.bitbucketRepository || "",
			);
			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				commitedPaths,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
		} else if (sourceType === "gitea") {
			const branchName = extractBranchName(req.headers, req.body);

			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			if (!branchName || branchName !== application.giteaBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		}

		try {
			const jobData: DeploymentJob = {
				applicationId: application.applicationId as string,
				titleLog: deploymentTitle,
				descriptionLog: `Hash: ${deploymentHash}`,
				type: "deploy",
				applicationType: "application",
				server: !!application.serverId,
			};

			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				await deploy(jobData);
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		} catch (error) {
			res.status(400).json({ message: "Error deploying Application", error });
			return;
		}

		res.status(200).json({ message: "Application deployed successfully" });
	} catch (error) {
		console.log(error);
		res.status(400).json({ message: "Error deploying Application", error });
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
export const extractImageTagFromRequest = (
	headers: any,
	body: any,
): string | null => {
	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.push_data && body.repository) {
			return body.push_data.tag;
		}
	}
	return null;
};

export const extractCommitMessage = (headers: any, body: any) => {
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
};

export const extractHash = (headers: any, body: any) => {
	// GitHub
	if (headers["x-github-event"]) {
		return body.head_commit ? body.head_commit.id : "";
	}

	// GitLab
	if (headers["x-gitlab-event"]) {
		return (
			body.checkout_sha ||
			(body.commits && body.commits.length > 0
				? body.commits[0].id
				: "NEW COMMIT")
		);
	}

	// Bitbucket
	if (headers["x-event-key"]?.includes("repo:push")) {
		return body.push.changes && body.push.changes.length > 0
			? body.push.changes[0].new.target.hash
			: "NEW COMMIT";
	}

	// Gitea
	if (headers["x-gitea-event"]) {
		return body.after || "NEW COMMIT";
	}

	return "";
};

export const extractBranchName = (headers: any, body: any) => {
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
};

export const getProviderByHeader = (headers: any) => {
	if (headers["x-github-event"]) {
		return "github";
	}

	if (headers["x-gitea-event"]) {
		return "gitea";
	}

	if (headers["x-gitlab-event"]) {
		return "gitlab";
	}

	if (headers["x-event-key"]?.includes("repo:push")) {
		return "bitbucket";
	}

	return null;
};

export const extractCommitedPaths = async (
	body: any,
	bitbucketUsername: string | null,
	bitbucketAppPassword: string | null,
	repository: string | null,
) => {
	const changes = body.push?.changes || [];

	const commitHashes = changes
		.map((change: any) => change.new?.target?.hash)
		.filter(Boolean);
	const commitedPaths: string[] = [];
	for (const commit of commitHashes) {
		const url = `https://api.bitbucket.org/2.0/repositories/${bitbucketUsername}/${repository}/diffstat/${commit}`;

		try {
			const response = await fetch(url, {
				headers: {
					Authorization: `Basic ${Buffer.from(`${bitbucketUsername}:${bitbucketAppPassword}`).toString("base64")}`,
				},
			});

			const data = await response.json();
			for (const value of data.values) {
				commitedPaths.push(value.new?.path);
			}
		} catch (error) {
			console.error(
				`Error fetching Bitbucket diffstat for commit ${commit}:`,
				error instanceof Error ? error.message : "Unknown error",
			);

			return [];
		}
	}

	return commitedPaths;
};
