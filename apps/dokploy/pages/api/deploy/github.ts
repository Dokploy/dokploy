import {
	// build-policy hook: enqueue-time gate.
	buildPolicyDeployGate,
	checkUserRepositoryPermissions,
	createComposePreview,
	createPreviewDeployment,
	createSecurityBlockedComment,
	findGithubById,
	findPreviewDeploymentByApplicationId,
	findPreviewDeploymentByComposeId,
	findPreviewDeploymentsByPullRequestId,
	IS_CLOUD,
	normalizeChangedFilesFromCommits,
	removePreviewDeployment,
	shouldDeploy,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { Webhooks } from "@octokit/webhooks";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { applications, compose, github } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
// >>> build-policy hook: enqueue-time gate (skip marker, derived watchPaths,
// queue coalescing). See packages/server/src/services/build-policy/README.md
import {
	coalesceQueuedApplicationDeploys,
	coalesceQueuedComposeDeploys,
	myQueue,
} from "@/server/queues/queueSetup";
// <<< build-policy hook
import { deploy } from "@/server/utils/deploy";
import {
	extractCommitMessage,
	extractHash,
	logWebhookError,
} from "./[refreshToken]";

const getGithubRepositoryOwner = (githubBody: any) =>
	githubBody?.repository?.owner?.name ?? githubBody?.repository?.owner?.login;

/**
 * Decides whether a `pull_request` webhook should (re)deploy a preview.
 *
 * Code-changing events (`opened`, `synchronize`, `reopened`) always deploy.
 * Label events (`labeled`, `unlabeled`) only deploy when they just created a
 * preview that was missing — they must never redeploy an existing one.
 *
 * Without this, opening a PR that already has a label deploys twice: GitHub
 * fires `opened` and `labeled` together, and both used to trigger a deployment.
 */
export const shouldDeployPreviewDeployment = ({
	action,
	createdPreviewDeployment,
}: {
	action: string | undefined;
	createdPreviewDeployment: boolean;
}) => {
	const isCodeEvent =
		action === "opened" || action === "synchronize" || action === "reopened";
	return isCodeEvent || createdPreviewDeployment;
};

export const config = {
	api: {
		bodyParser: {
			sizeLimit: "25mb",
		},
	},
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const signature = req.headers["x-hub-signature-256"];
	if (!signature) {
		res.status(401).json({ message: "Missing signature header" });
		return;
	}

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

	// skip workflow runs use keywords
	// @link https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/skipping-workflow-runs
	if (
		[
			"[skip ci]",
			"[ci skip]",
			"[no ci]",
			"[skip actions]",
			"[actions skip]",
		].find((keyword) =>
			extractCommitMessage(req.headers, req.body).includes(keyword),
		)
	) {
		res.status(200).json({
			message: "Deployment skipped: commit message contains skip keyword",
		});
		return;
	}

	// Handle tag creation event
	if (
		req.headers["x-github-event"] === "push" &&
		githubBody?.ref?.startsWith("refs/tags/")
	) {
		try {
			const tagName = githubBody?.ref.replace("refs/tags/", "");
			const repository = githubBody?.repository?.name;
			const owner = getGithubRepositoryOwner(githubBody);
			const deploymentTitle = `Tag created: ${tagName}`;
			const deploymentHash = extractHash(req.headers, githubBody);

			// Find applications configured to deploy on tag
			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "github"),
					eq(applications.autoDeploy, true),
					eq(applications.triggerType, "tag"),
					eq(applications.repository, repository),
					eq(applications.owner, owner),
					eq(applications.githubId, githubResult.githubId),
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
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
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

			// Find compose apps configured to deploy on tag
			const composeApps = await db.query.compose.findMany({
				where: and(
					eq(compose.sourceType, "github"),
					eq(compose.autoDeploy, true),
					eq(compose.triggerType, "tag"),
					eq(compose.repository, repository),
					eq(compose.owner, owner),
					eq(compose.githubId, githubResult.githubId),
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
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
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

			if (totalApps === 0) {
				res
					.status(200)
					.json({ message: "No apps configured to deploy on tag" });
				return;
			}

			res.status(200).json({
				message: `Deployed ${totalApps} apps based on tag ${tagName}`,
			});
			return;
		} catch (error) {
			logWebhookError("Error deploying applications on tag:", error);
			res.status(400).json({ message: "Error deploying applications on tag" });
			return;
		}
	}

	if (req.headers["x-github-event"] === "push") {
		try {
			const branchName = githubBody?.ref?.replace("refs/heads/", "");
			const repository = githubBody?.repository?.name;

			const deploymentTitle = extractCommitMessage(req.headers, req.body);
			const deploymentHash = extractHash(req.headers, req.body);
			const owner = getGithubRepositoryOwner(githubBody);
			const normalizedCommits = normalizeChangedFilesFromCommits(
				githubBody?.commits,
			);

			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "github"),
					eq(applications.autoDeploy, true),
					eq(applications.triggerType, "push"),
					eq(applications.branch, branchName),
					eq(applications.repository, repository),
					eq(applications.owner, owner),
					eq(applications.githubId, githubResult.githubId),
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

				const shouldDeployPaths = shouldDeploy(
					app.watchPaths,
					normalizedCommits,
				);

				if (!shouldDeployPaths) {
					continue;
				}

				// >>> build-policy hook
				const gate = await buildPolicyDeployGate({
					unitType: "application",
					unit: {
						unitId: app.applicationId,
						unitName: app.name,
						environmentId: app.environmentId,
						watchPaths: app.watchPaths,
						sourceType: app.sourceType,
						buildPath: app.buildPath,
						gitlabBuildPath: app.gitlabBuildPath,
						bitbucketBuildPath: app.bitbucketBuildPath,
						giteaBuildPath: app.giteaBuildPath,
						dropBuildPath: app.dropBuildPath,
						customGitBuildPath: app.customGitBuildPath,
						dockerfile: app.dockerfile,
						dockerContextPath: app.dockerContextPath,
					},
					changedFiles: normalizedCommits,
					commitMessage: deploymentTitle,
					removeWaiting: () =>
						coalesceQueuedApplicationDeploys(app.applicationId),
				});
				if (!gate.deploy) continue;
				// <<< build-policy hook

				if (IS_CLOUD && app.serverId) {
					jobData.serverId = app.serverId;
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
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
					eq(compose.triggerType, "push"),
					eq(compose.branch, branchName),
					eq(compose.repository, repository),
					eq(compose.owner, owner),
					eq(compose.githubId, githubResult.githubId),
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

				const shouldDeployPaths = shouldDeploy(
					composeApp.watchPaths,
					normalizedCommits,
				);

				if (!shouldDeployPaths) {
					continue;
				}

				// >>> build-policy hook
				const composeGate = await buildPolicyDeployGate({
					unitType: "compose",
					unit: {
						unitId: composeApp.composeId,
						unitName: composeApp.name,
						environmentId: composeApp.environmentId,
						watchPaths: composeApp.watchPaths,
						composePath: composeApp.composePath,
					},
					changedFiles: normalizedCommits,
					commitMessage: deploymentTitle,
					removeWaiting: () =>
						coalesceQueuedComposeDeploys(composeApp.composeId),
				});
				if (!composeGate.deploy) continue;
				// <<< build-policy hook

				if (IS_CLOUD && composeApp.serverId) {
					jobData.serverId = composeApp.serverId;
					deploy(jobData).catch((error) => {
						console.error("Background deployment failed:", error);
					});
					continue;
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
			logWebhookError("Error deploying Application:", error);
			res.status(400).json({ message: "Error deploying Application" });
		}
	} else if (req.headers["x-github-event"] === "pull_request") {
		const prId = githubBody?.pull_request?.id;
		const action = githubBody?.action;

		if (action === "closed") {
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
		if (
			action === "opened" ||
			action === "synchronize" ||
			action === "reopened" ||
			action === "labeled" ||
			action === "unlabeled"
		) {
			const shouldCreateDeployment =
				action === "opened" ||
				action === "synchronize" ||
				action === "reopened" ||
				action === "labeled";

			const repository = githubBody?.repository?.name;
			const deploymentHash = githubBody?.pull_request?.head?.sha;
			const branch = githubBody?.pull_request?.base?.ref;
			const owner = getGithubRepositoryOwner(githubBody);
			const prAuthor = githubBody?.pull_request?.user?.login;

			// Validate PR author information is present
			if (!prAuthor) {
				console.warn(
					"⚠️ SECURITY: PR author information missing in webhook payload",
				);
				res.status(400).json({
					message: "PR author information missing",
				});
				return;
			}

			const apps = await db.query.applications.findMany({
				where: and(
					eq(applications.sourceType, "github"),
					eq(applications.repository, repository),
					eq(applications.branch, branch),
					eq(applications.isPreviewDeploymentsActive, true),
					eq(applications.owner, owner),
					eq(applications.githubId, githubResult.githubId),
				),
				with: {
					previewDeployments: true,
				},
			});

			// SECURITY: Check collaborator permissions per application setting
			const secureApps: typeof apps = [];
			const blockedApps: string[] = [];
			let userPermission: string | null = null;

			for (const app of apps) {
				// If the app requires collaborator permissions, verify them
				if (app.previewRequireCollaboratorPermissions !== false) {
					try {
						const githubProvider = await findGithubById(githubResult.githubId);
						const { hasWriteAccess, permission } =
							await checkUserRepositoryPermissions(
								githubProvider,
								owner,
								repository,
								prAuthor,
							);

						userPermission = permission; // Store permission for comment

						if (!hasWriteAccess) {
							console.warn(
								`🚨 SECURITY: Blocked preview deployment for ${app.name} from unauthorized user ${prAuthor} on ${owner}/${repository}. Permission: ${permission || "none"}`,
							);
							blockedApps.push(app.name);
							continue;
						}

						console.log(
							`✅ SECURITY: Preview deployment authorized for ${app.name} from user ${prAuthor} on ${owner}/${repository}. Permission: ${permission}`,
						);
					} catch (error) {
						console.error(
							`Error validating PR author permissions for ${app.name}:`,
							error,
						);
						blockedApps.push(app.name);
						continue; // Skip this app on error
					}
				} else {
					console.warn(
						`⚠️  SECURITY: Preview deployment for ${app.name} allows deployment from any PR author (security check disabled)`,
					);
				}
				secureApps.push(app);
			}

			const prBranch = githubBody?.pull_request?.head?.ref;

			const prNumber = githubBody?.pull_request?.number;
			const prTitle = githubBody?.pull_request?.title;
			const prURL = githubBody?.pull_request?.html_url;

			// Create security notification comment if any apps were blocked
			if (blockedApps.length > 0) {
				await createSecurityBlockedComment({
					owner,
					repository,
					prNumber: Number.parseInt(prNumber),
					prAuthor,
					permission: userPermission,
					githubId: githubResult.githubId,
				});
			}

			for (const app of secureApps) {
				// check for labels
				if (app?.previewLabels && app?.previewLabels?.length > 0) {
					let hasLabel = false;
					const labels = githubBody?.pull_request?.labels;
					for (const label of labels) {
						if (app?.previewLabels?.includes(label.name)) {
							hasLabel = true;
							break;
						}
					}
					if (!hasLabel) continue;
				}

				const previewDeploymentResult =
					await findPreviewDeploymentByApplicationId(app.applicationId, prId);

				let previewDeploymentId =
					previewDeploymentResult?.previewDeploymentId || "";
				let createdPreviewDeployment = false;

				if (!previewDeploymentResult && shouldCreateDeployment) {
					// The limit only applies to new previews, existing ones must
					// still be redeployed when the pull request is updated.
					const previewLimit = app?.previewLimit ?? 3;
					if ((app?.previewDeployments?.length ?? 0) >= previewLimit) {
						console.warn(
							`⚠️ Preview deployment limit (${previewLimit}) reached for ${app.name}, skipping preview for pull request #${prNumber}`,
						);
						continue;
					}
					const previewDeployment = await createPreviewDeployment({
						applicationId: app.applicationId as string,
						branch: prBranch,
						pullRequestId: prId,
						pullRequestNumber: prNumber,
						pullRequestTitle: prTitle,
						pullRequestURL: prURL,
					});
					previewDeploymentId = previewDeployment.previewDeploymentId;
					createdPreviewDeployment = true;
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

				if (
					previewDeploymentId &&
					shouldDeployPreviewDeployment({ action, createdPreviewDeployment })
				) {
					if (IS_CLOUD && app.serverId) {
						jobData.serverId = app.serverId;
						deploy(jobData).catch((error) => {
							console.error("Background deployment failed:", error);
						});
						continue;
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
			}

			// --- Compose preview deployments (mirrors the application flow) ---
			const composeApps = await db.query.compose.findMany({
				where: and(
					eq(compose.sourceType, "github"),
					eq(compose.repository, repository),
					eq(compose.branch, branch),
					eq(compose.isPreviewDeploymentsActive, true),
					eq(compose.owner, owner),
					eq(compose.githubId, githubResult.githubId),
				),
				with: {
					previewDeployments: true,
					domains: true,
				},
			});

			// SECURITY: same collaborator-permission gate as applications, honoring
			// each compose's previewRequireCollaboratorPermissions flag.
			const secureComposeApps: typeof composeApps = [];
			const blockedComposeApps: string[] = [];
			let composeUserPermission: string | null = null;

			for (const composeApp of composeApps) {
				if (composeApp.previewRequireCollaboratorPermissions !== false) {
					try {
						const githubProvider = await findGithubById(githubResult.githubId);
						const { hasWriteAccess, permission } =
							await checkUserRepositoryPermissions(
								githubProvider,
								owner,
								repository,
								prAuthor,
							);

						composeUserPermission = permission;

						if (!hasWriteAccess) {
							console.warn(
								`🚨 SECURITY: Blocked compose preview deployment for ${composeApp.name} from unauthorized user ${prAuthor} on ${owner}/${repository}. Permission: ${permission || "none"}`,
							);
							blockedComposeApps.push(composeApp.name);
							continue;
						}
					} catch (error) {
						console.error(
							`Error validating PR author permissions for ${composeApp.name}:`,
							error,
						);
						blockedComposeApps.push(composeApp.name);
						continue;
					}
				} else {
					console.warn(
						`⚠️  SECURITY: Compose preview deployment for ${composeApp.name} allows deployment from any PR author (security check disabled)`,
					);
				}
				secureComposeApps.push(composeApp);
			}

			if (blockedComposeApps.length > 0) {
				await createSecurityBlockedComment({
					owner,
					repository,
					prNumber: Number.parseInt(prNumber),
					prAuthor,
					permission: composeUserPermission,
					githubId: githubResult.githubId,
				});
			}

			for (const composeApp of secureComposeApps) {
				// check for labels
				if (
					composeApp?.previewLabels &&
					composeApp?.previewLabels?.length > 0
				) {
					let hasLabel = false;
					const labels = githubBody?.pull_request?.labels;
					for (const label of labels) {
						if (composeApp?.previewLabels?.includes(label.name)) {
							hasLabel = true;
							break;
						}
					}
					if (!hasLabel) continue;
				}

				const existingComposePreview = await findPreviewDeploymentByComposeId(
					composeApp.composeId,
					prId,
				);

				let previewDeploymentId =
					existingComposePreview?.previewDeploymentId || "";
				let createdPreviewDeployment = false;

				if (!existingComposePreview && shouldCreateDeployment) {
					// Only enforce the limit for new previews, not updates to existing ones
					const previewLimit = composeApp?.previewLimit ?? 3;
					if ((composeApp?.previewDeployments?.length ?? 0) >= previewLimit) {
						continue;
					}
					const previewDeployment = await createComposePreview({
						composeId: composeApp.composeId,
						branch: prBranch,
						pullRequestId: prId,
						pullRequestNumber: prNumber,
						pullRequestTitle: prTitle,
						pullRequestURL: prURL,
					});
					previewDeploymentId = previewDeployment.previewDeploymentId;
					createdPreviewDeployment = true;
				}

				const jobData: DeploymentJob = {
					composeId: composeApp.composeId,
					titleLog: "Preview Deployment",
					descriptionLog: `Hash: ${deploymentHash}`,
					type: "deploy",
					applicationType: "compose-preview",
					server: !!composeApp.serverId,
					previewDeploymentId,
				};

				if (
					previewDeploymentId &&
					shouldDeployPreviewDeployment({ action, createdPreviewDeployment })
				) {
					if (IS_CLOUD && composeApp.serverId) {
						jobData.serverId = composeApp.serverId;
						deploy(jobData).catch((error) => {
							console.error("Background deployment failed:", error);
						});
						continue;
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
			}

			return res.status(200).json({ message: "Apps Deployed" });
		}
	}

	return res.status(400).json({ message: "No Actions matched" });
}
