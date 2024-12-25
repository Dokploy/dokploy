import { db } from "@/server/db";
import { applications, compose, github } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { generateRandomDomain } from "@/templates/utils";
import {
	type Domain,
	IS_CLOUD,
	createPreviewDeployment,
	findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId,
	removePreviewDeployment,
} from "@dokploy/server";
import { Webhooks } from "@octokit/webhooks";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { extractCommitMessage, extractHash } from "./[refreshToken]";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const signature = req.headers["x-hub-signature-256"];
	const githubBody = req.body;

	if (!githubBody?.installation?.id) {
		res.status(400).json({ message: "Github Installation not found" });
		return;
	}

	const githubResult = await db.query.github.findFirst({
		where: eq(github.githubInstallationId, githubBody.installation.id),
	});

	if (!githubResult) {
		res.status(400).json({ message: "Github Installation not found" });
		return;
	}

	if (!githubResult.githubWebhookSecret) {
		res.status(400).json({ message: "Github Webhook Secret not set" });
		return;
	}
	const webhooks = new Webhooks({
		secret: githubResult.githubWebhookSecret,
	});

	const verified = await webhooks.verify(
		JSON.stringify(githubBody),
		signature as string,
	);

	if (!verified) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	if (req.headers["x-github-event"] === "ping") {
		res.status(200).json({ message: "Ping received, webhook is active" });
		return;
	}

	if (
		req.headers["x-github-event"] !== "push" &&
		req.headers["x-github-event"] !== "pull_request"
	) {
		res
			.status(400)
			.json({ message: "We only accept push events or pull_request events" });
		return;
	}

	if (req.headers["x-github-event"] === "push") {
		try {
			const branchName = githubBody?.ref?.replace("refs/heads/", "");
			const repository = githubBody?.repository?.name;
			const deploymentTitle = extractCommitMessage(req.headers, req.body);
			const deploymentHash = extractHash(req.headers, req.body);
			const owner = githubBody?.repository?.owner?.name;

			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "github"),
					eq(applications.autoDeploy, true),
					eq(applications.branch, branchName),
					eq(applications.repository, repository),
					eq(applications.owner, owner),
				),
			});

			for (const app of apps) {
				const jobData: DeploymentJob = {
					applicationId: app.applicationId as string,
					titleLog: deploymentTitle,
					descriptionLog: `Hash: ${deploymentHash}`,
					type: "deploy",
					applicationType: "application",
					server: !!app.serverId,
				};

				if (IS_CLOUD && app.serverId) {
					jobData.serverId = app.serverId;
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
			}

			const composeApps = await db.query.compose.findMany({
				where: and(
					eq(compose.sourceType, "github"),
					eq(compose.autoDeploy, true),
					eq(compose.branch, branchName),
					eq(compose.repository, repository),
					eq(compose.owner, owner),
				),
			});

			for (const composeApp of composeApps) {
				const jobData: DeploymentJob = {
					composeId: composeApp.composeId as string,
					titleLog: deploymentTitle,
					type: "deploy",
					applicationType: "compose",
					descriptionLog: `Hash: ${deploymentHash}`,
					server: !!composeApp.serverId,
				};

				if (IS_CLOUD && composeApp.serverId) {
					jobData.serverId = composeApp.serverId;
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
			}

			const totalApps = apps.length + composeApps.length;
			const emptyApps = totalApps === 0;

			if (emptyApps) {
				res.status(200).json({ message: "No apps to deploy" });
				return;
			}
			res.status(200).json({ message: `Deployed ${totalApps} apps` });
		} catch (error) {
			res.status(400).json({ message: "Error To Deploy Application", error });
		}
	} else if (req.headers["x-github-event"] === "pull_request") {
		const prId = githubBody?.pull_request?.id;

		if (githubBody?.action === "closed") {
			const previewDeploymentResult =
				await findPreviewDeploymentsByPullRequestId(prId);

			if (previewDeploymentResult.length > 0) {
				for (const previewDeployment of previewDeploymentResult) {
					try {
						await removePreviewDeployment(
							previewDeployment.previewDeploymentId,
						);
					} catch (error) {
						console.log(error);
					}
				}
			}
			res.status(200).json({ message: "Preview Deployment Closed" });
			return;
		}
		// opened or synchronize or reopened
		const repository = githubBody?.repository?.name;
		const deploymentHash = githubBody?.pull_request?.head?.sha;
		const branch = githubBody?.pull_request?.base?.ref;
		const owner = githubBody?.repository?.owner?.login;

		const apps = await db.query.applications.findMany({
			where: and(
				eq(applications.sourceType, "github"),
				eq(applications.repository, repository),
				eq(applications.branch, branch),
				eq(applications.isPreviewDeploymentsActive, true),
				eq(applications.owner, owner),
			),
			with: {
				previewDeployments: true,
			},
		});

		const prBranch = githubBody?.pull_request?.head?.ref;

		const prNumber = githubBody?.pull_request?.number;
		const prTitle = githubBody?.pull_request?.title;
		const prURL = githubBody?.pull_request?.html_url;

		for (const app of apps) {
			const previewLimit = app?.previewLimit || 0;
			if (app?.previewDeployments?.length > previewLimit) {
				continue;
			}
			const previewDeploymentResult =
				await findPreviewDeploymentByApplicationId(app.applicationId, prId);

			let previewDeploymentId =
				previewDeploymentResult?.previewDeploymentId || "";

			if (!previewDeploymentResult) {
				const previewDeployment = await createPreviewDeployment({
					applicationId: app.applicationId as string,
					branch: prBranch,
					pullRequestId: prId,
					pullRequestNumber: prNumber,
					pullRequestTitle: prTitle,
					pullRequestURL: prURL,
				});
				previewDeploymentId = previewDeployment.previewDeploymentId;
			}

			const jobData: DeploymentJob = {
				applicationId: app.applicationId as string,
				titleLog: "Preview Deployment",
				descriptionLog: `Hash: ${deploymentHash}`,
				type: "deploy",
				applicationType: "application-preview",
				server: !!app.serverId,
				previewDeploymentId,
			};

			if (IS_CLOUD && app.serverId) {
				jobData.serverId = app.serverId;
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
		}
		return res.status(200).json({ message: "Apps Deployed" });
	}

	return res.status(400).json({ message: "No Actions matched" });
}
