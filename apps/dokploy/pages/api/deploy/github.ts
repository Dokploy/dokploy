import { db } from "@/server/db";
import { applications, compose, github } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/deployments-queue";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { IS_CLOUD, findAdmin } from "@dokploy/server";
import { Webhooks } from "@octokit/webhooks";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { extractCommitMessage, extractHash } from "./[refreshToken]";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const admin = await findAdmin();

	if (!admin) {
		res.status(200).json({ message: "Could not find admin" });
		return;
	}

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

	if (req.headers["x-github-event"] !== "push") {
		res.status(400).json({ message: "We only accept push events" });
		return;
	}

	try {
		const branchName = githubBody?.ref?.replace("refs/heads/", "");
		const repository = githubBody?.repository?.name;
		const deploymentTitle = extractCommitMessage(req.headers, req.body);
		const deploymentHash = extractHash(req.headers, req.body);

		const apps = await db.query.applications.findMany({
			where: and(
				eq(applications.sourceType, "github"),
				eq(applications.autoDeploy, true),
				eq(applications.branch, branchName),
				eq(applications.repository, repository),
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
			),
		});

		for (const composeApp of composeApps) {
			const jobData: DeploymentJob = {
				composeId: composeApp.composeId as string,
				titleLog: deploymentTitle,
				type: "deploy",
				applicationType: "compose",
				descriptionLog: `Hash: ${deploymentHash}`,
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
}
