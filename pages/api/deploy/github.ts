import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import type { NextApiRequest, NextApiResponse } from "next";
import { applications, compose } from "@/server/db/schema";
import { extractCommitMessage, extractHash } from "./[refreshToken]";
import type { DeploymentJob } from "@/server/queues/deployments-queue";
import { myQueue } from "@/server/queues/queueSetup";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const github = req.body;

	if (req.headers["x-github-event"] === "ping") {
		res.status(200).json({ message: "Ping received, webhook is active" });
		return;
	}

	if (req.headers["x-github-event"] !== "push") {
		res.status(400).json({ message: "We only accept push events" });
		return;
	}

	try {
		const branchName = github?.ref?.replace("refs/heads/", "");
		const repository = github?.repository?.name;
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
			};
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
