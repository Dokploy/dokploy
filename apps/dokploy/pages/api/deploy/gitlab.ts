import {
	IS_CLOUD,
	checkGitlabMemberPermissions,
	createPreviewDeployment,
	createSecurityBlockedMRNote,
	findGitlabByWebhookSecret,
	findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId,
	removePreviewDeployment,
	shouldDeploy,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { applications, compose } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const token = req.headers["x-gitlab-token"] as string | undefined;

	if (!token) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	const gitlabProvider = await findGitlabByWebhookSecret(token);

	if (!gitlabProvider) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	const event = req.headers["x-gitlab-event"] as string;
	const body = req.body;

	if (event === "Tag Push Hook") {
		try {
			const tagName = body?.ref?.replace("refs/tags/", "");
			const deploymentHash = body?.checkout_sha;
			const pathNamespace = body?.project?.path_with_namespace;

			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "gitlab"),
					eq(applications.autoDeploy, true),
					eq(applications.triggerType, "tag"),
					eq(applications.gitlabPathNamespace, pathNamespace),
					eq(applications.gitlabId, gitlabProvider.gitlabId),
				),
			});

			for (const app of apps) {
				const jobData: DeploymentJob = {
					applicationId: app.applicationId as string,
					titleLog: `Tag created: ${tagName}`,
					descriptionLog: `Hash: ${deploymentHash}`,
					type: "deploy",
					applicationType: "application",
					server: !!app.serverId,
				};

				if (IS_CLOUD && app.serverId) {
					jobData.serverId = app.serverId;
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
				}
				await myQueue.add("deployments", { ...jobData }, {
					removeOnComplete: true,
					removeOnFail: true,
				});
			}

			const composeApps = await db.query.compose.findMany({
				where: and(
					eq(compose.sourceType, "gitlab"),
					eq(compose.autoDeploy, true),
					eq(compose.triggerType, "tag"),
					eq(compose.gitlabPathNamespace, pathNamespace),
					eq(compose.gitlabId, gitlabProvider.gitlabId),
				),
			});

			for (const composeApp of composeApps) {
				const jobData: DeploymentJob = {
					composeId: composeApp.composeId as string,
					titleLog: `Tag created: ${tagName}`,
					descriptionLog: `Hash: ${deploymentHash}`,
					type: "deploy",
					applicationType: "compose",
					server: !!composeApp.serverId,
				};

				if (IS_CLOUD && composeApp.serverId) {
					jobData.serverId = composeApp.serverId;
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
				}
				await myQueue.add("deployments", { ...jobData }, {
					removeOnComplete: true,
					removeOnFail: true,
				});
			}

			const totalApps = apps.length + composeApps.length;
			res.status(200).json({
				message:
					totalApps === 0
						? "No apps configured to deploy on tag"
						: `Deployed ${totalApps} apps based on tag ${tagName}`,
			});
		} catch (error) {
			res.status(400).json({ message: "Error deploying application", error });
		}
		return;
	}

	if (event === "Push Hook") {
		try {
			const branchName = body?.ref?.replace("refs/heads/", "");
			const deploymentHash = body?.checkout_sha;
			const pathNamespace = body?.project?.path_with_namespace;
			const modifiedFiles: string[] = (body?.commits ?? []).flatMap(
				(commit: any) => [
					...(commit.added ?? []),
					...(commit.modified ?? []),
					...(commit.removed ?? []),
				],
			);

			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "gitlab"),
					eq(applications.autoDeploy, true),
					eq(applications.triggerType, "push"),
					eq(applications.gitlabPathNamespace, pathNamespace),
					eq(applications.gitlabBranch, branchName),
					eq(applications.gitlabId, gitlabProvider.gitlabId),
				),
			});

			for (const app of apps) {
				const jobData: DeploymentJob = {
					applicationId: app.applicationId as string,
					titleLog: `Push to ${branchName}`,
					descriptionLog: `Hash: ${deploymentHash}`,
					type: "deploy",
					applicationType: "application",
					server: !!app.serverId,
				};

				if (!shouldDeploy(app.watchPaths, modifiedFiles)) {
					continue;
				}

				if (IS_CLOUD && app.serverId) {
					jobData.serverId = app.serverId;
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
				}
				await myQueue.add("deployments", { ...jobData }, {
					removeOnComplete: true,
					removeOnFail: true,
				});
			}

			const composeApps = await db.query.compose.findMany({
				where: and(
					eq(compose.sourceType, "gitlab"),
					eq(compose.autoDeploy, true),
					eq(compose.triggerType, "push"),
					eq(compose.gitlabPathNamespace, pathNamespace),
					eq(compose.gitlabBranch, branchName),
					eq(compose.gitlabId, gitlabProvider.gitlabId),
				),
			});

			for (const composeApp of composeApps) {
				const jobData: DeploymentJob = {
					composeId: composeApp.composeId as string,
					titleLog: `Push to ${branchName}`,
					descriptionLog: `Hash: ${deploymentHash}`,
					type: "deploy",
					applicationType: "compose",
					server: !!composeApp.serverId,
				};

				if (!shouldDeploy(composeApp.watchPaths, modifiedFiles)) {
					continue;
				}

				if (IS_CLOUD && composeApp.serverId) {
					jobData.serverId = composeApp.serverId;
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
				}
				await myQueue.add("deployments", { ...jobData }, {
					removeOnComplete: true,
					removeOnFail: true,
				});
			}

			const totalApps = apps.length + composeApps.length;
			res.status(200).json({
				message:
					totalApps === 0
						? "No apps to deploy"
						: `Deployed ${totalApps} apps`,
			});
		} catch (error) {
			res.status(400).json({ message: "Error deploying application", error });
		}
		return;
	}

	if (event === "Merge Request Hook") {
		const mrId = String(body?.object_attributes?.id);
		const mrIid = body?.object_attributes?.iid as number;
		const action = body?.object_attributes?.action as string;
		const projectId = body?.project?.id as number;
		const pathNamespace = body?.project?.path_with_namespace as string;

		// Teardown BEFORE the mrAuthor null-guard: close/merge must clean up
		// even if the payload is missing user information.
		if (action === "close" || action === "merge") {
			const previewDeployments =
				await findPreviewDeploymentsByPullRequestId(mrId);

			for (const previewDeployment of previewDeployments) {
				try {
					await removePreviewDeployment(
						previewDeployment.previewDeploymentId,
					);
				} catch (error) {
					console.error(error);
				}
			}
			res.status(200).json({ message: "Preview Deployment Closed" });
			return;
		}

		const mrAuthor = body?.user?.username as string | undefined;

		if (!mrAuthor) {
			console.warn(
				"⚠️ SECURITY: MR author information missing in webhook payload",
			);
			res.status(400).json({ message: "MR author information missing" });
			return;
		}

		if (
			action === "open" ||
			action === "update" ||
			action === "reopen" ||
			action === "labeled"
		) {
			const targetBranch = body?.object_attributes?.target_branch as string;
			const sourceBranch = body?.object_attributes?.source_branch as string;
			const mrTitle = body?.object_attributes?.title as string;
			const mrUrl = body?.object_attributes?.url as string;
			const mrNumber = String(mrIid);
			const deploymentHash = body?.object_attributes?.last_commit?.id as string;

			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "gitlab"),
					eq(applications.gitlabPathNamespace, pathNamespace),
					eq(applications.gitlabBranch, targetBranch),
					eq(applications.isPreviewDeploymentsActive, true),
					eq(applications.gitlabId, gitlabProvider.gitlabId),
				),
				with: {
					previewDeployments: true,
				},
			});

			// Permission check is per-MR-author, not per-app — check once before the loop
			const requiresPermissionCheck = apps.some(
				(app) => app.previewRequireCollaboratorPermissions !== false,
			);
			let permissionResult: Awaited<
				ReturnType<typeof checkGitlabMemberPermissions>
			> | null = null;
			let permissionError: unknown = null;

			if (requiresPermissionCheck) {
				try {
					permissionResult = await checkGitlabMemberPermissions(
						gitlabProvider.gitlabId,
						projectId,
						mrAuthor,
					);
				} catch (error) {
					permissionError = error;
					console.error("Error validating MR author permissions:", error);
				}
			}

			const secureApps: typeof apps = [];
			let blockedAccessLevel: number | null = null;
			let blocked = false;

			for (const app of apps) {
				if (app.previewRequireCollaboratorPermissions !== false) {
					if (permissionError) {
						continue;
					}
					const { hasWriteAccess, accessLevel } = permissionResult!;
					if (!hasWriteAccess) {
						console.warn(
							`🚨 SECURITY: Blocked preview deployment for ${app.name} from ${mrAuthor}. Access level: ${accessLevel}`,
						);
						if (!blocked) {
							blockedAccessLevel = accessLevel;
							blocked = true;
						}
						continue;
					}
				}
				secureApps.push(app);
			}

			if (blocked) {
				await createSecurityBlockedMRNote(
					gitlabProvider.gitlabId,
					projectId,
					mrIid,
					mrAuthor,
					pathNamespace,
					blockedAccessLevel,
				);
			}

			for (const app of secureApps) {
				// Label filtering
				if (app.previewLabels && app.previewLabels.length > 0) {
					const mrLabels: { title: string }[] =
						body?.object_attributes?.labels ?? [];
					const hasLabel = mrLabels.some((l) =>
						app.previewLabels!.includes(l.title),
					);
					if (!hasLabel) continue;
				}

				// Preview limit
				const previewLimit = app.previewLimit ?? 0;
				if (app.previewDeployments.length > previewLimit) {
					continue;
				}

				const existingDeployment =
					await findPreviewDeploymentByApplicationId(
						app.applicationId,
						mrId,
					);

				let previewDeploymentId =
					existingDeployment?.previewDeploymentId ?? "";

				if (!existingDeployment) {
					const newDeployment = await createPreviewDeployment({
						applicationId: app.applicationId as string,
						branch: sourceBranch,
						pullRequestId: mrId,
						pullRequestNumber: mrNumber,
						pullRequestTitle: mrTitle,
						pullRequestURL: mrUrl,
					});
					previewDeploymentId = newDeployment.previewDeploymentId;
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

				if (previewDeploymentId) {
					if (IS_CLOUD && app.serverId) {
						jobData.serverId = app.serverId;
						deploy(jobData).catch((error) => {
							console.error("Background deployment failed:", error);
						});
						continue;
					}
					await myQueue.add("deployments", { ...jobData }, {
						removeOnComplete: true,
						removeOnFail: true,
					});
				}
			}

			res.status(200).json({ message: "Apps Deployed" });
			return;
		}
	}

	res.status(400).json({ message: "No Actions matched" });
}
