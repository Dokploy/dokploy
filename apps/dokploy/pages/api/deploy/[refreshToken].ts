import {
	type Bitbucket,
	getBitbucketHeaders,
	IS_CLOUD,
	shouldDeploy,
} from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server/db";
import { applications } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";

/**
 * Helper function to get package_version from registry_package events
 */
const getPackageVersion = (headers: any, body: any) => {
	const event = headers["x-github-event"];
	if (event === "registry_package") {
		return body.registry_package?.package_version;
	}
	return null;
};

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
				environment: {
					with: {
						project: true,
					},
				},
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
			const applicationImageName = extractImageName(application.dockerImage);
			const applicationDockerTag = extractImageTag(application.dockerImage);

			const webhookImageName = extractImageNameFromRequest(
				req.headers,
				req.body,
			);
			const webhookDockerTag = extractImageTagFromRequest(
				req.headers,
				req.body,
			);

			if (!applicationImageName) {
				res.status(301).json({
					message: "Application Docker Image Name Not Found",
				});
				return;
			}

			if (!webhookImageName) {
				res.status(301).json({
					message: "Webhook Docker Image Name Not Found",
				});
				return;
			}

			// Validate image name matches
			if (webhookImageName !== applicationImageName) {
				res.status(301).json({
					message: `Application Image Name (${applicationImageName}) doesn't match request event payload Image Name (${webhookImageName}).`,
				});
				return;
			}

			if (!applicationDockerTag) {
				res.status(301).json({
					message: "Application Docker Tag Not Found",
				});
				return;
			}

			if (!webhookDockerTag) {
				res.status(301).json({
					message: "Webhook Docker Tag Not Found",
				});
				return;
			}

			if (webhookDockerTag !== applicationDockerTag) {
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
				application.bitbucket,
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
				...(deploymentHash && { descriptionLog: `Hash: ${deploymentHash}` }),
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
 * Return the image name without the tag
 * Example: "my-image" => "my-image"
 * Example: "my-image:latest" => "my-image"
 * Example: "my-image:1.0.0" => "my-image"
 * Example: "myregistryhost:5000/fedora/httpd:version1.0" => "myregistryhost:5000/fedora/httpd"
 * @link https://docs.docker.com/reference/cli/docker/image/tag/
 */
export function extractImageName(dockerImage: string | null): string | null {
	if (!dockerImage || typeof dockerImage !== "string") {
		return null;
	}

	// Handle case where there's no tag (no colon or colon is part of port number)
	const lastColonIndex = dockerImage.lastIndexOf(":");
	if (lastColonIndex === -1) {
		return dockerImage;
	}

	// Check if the part after the last colon looks like a tag (not a port number)
	// Port numbers are typically 1-5 digits, tags are usually longer or contain letters
	const afterColon = dockerImage.substring(lastColonIndex + 1);
	const isPortNumber = /^\d{1,5}$/.test(afterColon);

	// If it's a port number (like registry:5000/image), don't split
	if (isPortNumber) {
		return dockerImage;
	}

	// Otherwise, split at the last colon to get image name
	return dockerImage.substring(0, lastColonIndex);
}

/**
 * Return the last part of the image name, which is the tag
 * Example: "my-image" => null
 * Example: "my-image:latest" => "latest"
 * Example: "my-image:1.0.0" => "1.0.0"
 * Example: "myregistryhost:5000/fedora/httpd:version1.0" => "version1.0"
 * @link https://docs.docker.com/reference/cli/docker/image/tag/
 */
export function extractImageTag(dockerImage: string | null) {
	if (!dockerImage || typeof dockerImage !== "string") {
		return null;
	}

	const tag = dockerImage.split(":").pop();
	return tag === dockerImage ? "latest" : tag;
}

/**
 * Extract the image name (without tag) from webhook request
 * @link https://docs.docker.com/docker-hub/webhooks/#example-webhook-payload
 * @link https://docs.github.com/en/webhooks/webhook-events-and-payloads#registry_package
 */
export const extractImageNameFromRequest = (
	headers: any,
	body: any,
): string | null => {
	// GitHub Packages: registry_package events (container registry)
	const packageVersion = getPackageVersion(headers, body);
	if (packageVersion?.package_url) {
		const packageUrl = packageVersion.package_url;
		// Remove tag if present (everything after the last colon)
		if (packageUrl.includes(":")) {
			const lastColonIndex = packageUrl.lastIndexOf(":");
			// Check if it's a port number (like registry:5000/image)
			const afterColon = packageUrl.substring(lastColonIndex + 1);
			const isPortNumber = /^\d{1,5}$/.test(afterColon);
			if (isPortNumber) {
				return packageUrl;
			}
			return packageUrl.substring(0, lastColonIndex);
		}
		return packageUrl;
	}

	// Docker Hub
	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.repository) {
			const repoName = body.repository.repo_name;
			return `${repoName}`;
		}
	}
	return null;
};

/**
 * @link https://docs.docker.com/docker-hub/webhooks/#example-webhook-payload
 * @link https://docs.github.com/en/webhooks/webhook-events-and-payloads#registry_package
 */
export const extractImageTagFromRequest = (
	headers: any,
	body: any,
): string | null => {
	// GitHub Packages: registry_package events (container registry)
	const packageVersion = getPackageVersion(headers, body);
	if (packageVersion) {
		// Try to get tag from container_metadata first (most reliable)
		// Only use it if it's not empty and not the same as the version (digest)
		const tagName = packageVersion.container_metadata?.tag?.name?.trim() || "";
		if (
			tagName &&
			tagName !== packageVersion.version &&
			!tagName.startsWith("sha256:")
		) {
			return tagName;
		}
		// Fallback: extract tag from package_url (e.g., "ghcr.io/owner/repo:tag")
		if (packageVersion.package_url) {
			const packageUrl = packageVersion.package_url;
			// Handle case where package_url ends with colon (no tag)
			if (packageUrl.endsWith(":")) {
				return null;
			}
			const tagMatch = packageUrl.match(/:([^:]+)$/);
			if (tagMatch?.[1]?.trim()) {
				return tagMatch[1].trim();
			}
		}
	}

	// Docker Hub
	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.push_data && body.repository) {
			return body.push_data.tag;
		}
	}
	return null;
};

export const extractCommitMessage = (headers: any, body: any) => {
	// GitHub Packages: registry_package events (container tags)
	const githubEvent = headers["x-github-event"];
	if (githubEvent === "registry_package") {
		const packageVersion = getPackageVersion(headers, body);
		if (packageVersion) {
			if (packageVersion.package_url) {
				return `Docker GHCR image pushed: ${packageVersion.package_url}`;
			}
			return "Docker GHCR image pushed";
		}
		// If package_version is missing, fall through to default behavior
	}
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
			return `DockerHub image pushed: ${body.repository.repo_name}:${body.push_data.tag} by ${body.push_data.pusher}`;
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
	bitbucket: Bitbucket | null,
	repository: string,
) => {
	const changes = body.push?.changes || [];

	const commitHashes = changes
		.map((change: any) => change.new?.target?.hash)
		.filter(Boolean);
	const commitedPaths: string[] = [];
	const username =
		bitbucket?.bitbucketWorkspaceName || bitbucket?.bitbucketUsername || "";
	for (const commit of commitHashes) {
		const url = `https://api.bitbucket.org/2.0/repositories/${username}/${repository}/diffstat/${commit}`;
		try {
			const response = await fetch(url, {
				headers: getBitbucketHeaders(bitbucket!),
			});
			const data = await response.json();
			for (const value of data.values) {
				if (value?.new?.path) commitedPaths.push(value.new.path);
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
